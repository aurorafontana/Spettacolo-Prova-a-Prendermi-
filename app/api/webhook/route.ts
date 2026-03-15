import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { generateCode, makeQrPayload } from '@/lib/helpers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error(`🔴 Errore firma: ${err.message}`);
    return NextResponse.json({ error: "Errore Firma" }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;
    const orderId = metadata?.orderId;

    console.log(`🟡 Elaborazione ordine: ${orderId}`);

    // --- PRIORITÀ 1: INVIO A EXCEL (Lo facciamo subito!) ---
    if (metadata?.seats) {
      const googleUrl = "https://script.google.com/macros/s/AKfycbxXjYsXrp2mu7P7CuyCPU0I4-_tyXwr5HFb0lekU12Jd9XVKW73WA4NyooyFcvbHkZ1/exec";
      try {
        await fetch(googleUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            dataOrdine: new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
            codiceOrdine: orderId || 'N/A',
            nome: session.customer_details?.name || 'N/A',
            email: session.customer_details?.email || 'N/A',
            telefono: metadata?.customerPhone || 'N/A',
            posti: metadata.seats,
            prezzo: (session.amount_total! / 100).toFixed(2) + ' €',
            dataSpettacolo: metadata?.eventId === '8676efe4-53b8-4952-828f-1f2dd60f1c9e' ? '4 Aprile' : '5 Aprile'
          }),
        });
        console.log("🟢 EXCEL AGGIORNATO");
      } catch (e) {
        console.error("🔴 ERRORE EXCEL:", e);
      }
    }

    // --- PRIORITÀ 2: AGGIORNAMENTO DATABASE ---
    if (orderId) {
      // 1. Ordine -> PAID
      const { data: order, error: updateError } = await supabase
        .from('orders')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', orderId)
        .select('id, order_code')
        .single();

      if (updateError) {
        console.error("🔴 ERRORE DATABASE ORDINE:", updateError);
      } else {
        console.log("🟢 DATABASE: ORDINE PAGATO");
        
        // 2. Creazione Biglietti (QR Code)
        // Proviamo a leggere i seatIds dai metadati
        let seatIds: string[] = [];
        try {
          if (metadata?.seatIds) seatIds = JSON.parse(metadata.seatIds);
        } catch (e) { console.error("Errore parsing seatIds"); }

        if (seatIds.length > 0) {
          // Segna posti come venduti
          await supabase.from('event_seats').update({ status: 'sold' }).in('id', seatIds);
          
          // Genera ticket
          const { data: seatsData } = await supabase.from('event_seats').select('id, price_cents').in('id', seatIds);
          if (seatsData) {
            const items = seatsData.map(s => ({
              order_id: orderId,
              event_seat_id: s.id,
              ticket_code: generateCode('TKT'),
              qr_payload: makeQrPayload(generateCode('TKT'), order.order_code),
              unit_price_cents: s.price_cents,
              status: 'valid'
            }));
            await supabase.from('order_items').insert(items);
            console.log("🟢 BIGLIETTI CREATI");
          }
          // Pulisce i blocchi
          await supabase.from('seat_locks').delete().eq('order_id', orderId);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}