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
    console.error(`🔴 Errore firma Webhook: ${err.message}`);
    return NextResponse.json({ error: "Errore Firma Stripe" }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;
    const orderId = metadata?.orderId; 

    if (orderId) {
      console.log(`🟡 Inizio elaborazione ordine: ${orderId}`);

      // --- 1. SUPABASE: AGGIORNAMENTO ORDINE ---
      // Usiamo 'paid', che è tra le parole permesse dal database
      const { data: order, error: updateError } = await supabase
        .from('orders')
        .update({ status: 'paid', paid_at: new Date().toISOString() }) 
        .eq('id', orderId)
        .select('id, order_code')
        .single();

      if (updateError) {
        console.error("🔴 ERRORE SUPABASE UPDATE ORDINE:", updateError);
      } else {
        console.log("🟢 ORDINE AGGIORNATO CON SUCCESSO SU SUPABASE");
      }

      // --- 2. SUPABASE: SBLOCCO POSTI E CREAZIONE BIGLIETTI (QR CODE) ---
      const { data: locks } = await supabase
        .from('seat_locks')
        .select('event_seat_id')
        .eq('order_id', orderId);

      if (locks && locks.length > 0) {
        const seatIds = locks.map(l => l.event_seat_id);
        
        // A. Coloriamo i posti di grigio (Venduti)
        await supabase.from('event_seats').update({ status: 'sold', lock_expires_at: null }).in('id', seatIds);
        
        // B. Recuperiamo il prezzo dei posti per generare i biglietti
        const { data: soldSeats } = await supabase.from('event_seats').select('id, price_cents').in('id', seatIds);
        
        // C. CREIAMO I BIGLIETTI E I QR CODE!
        if (soldSeats?.length && order) {
          const items = soldSeats.map((seat) => {
            const ticketCode = generateCode('TKT');
            return {
              order_id: orderId,
              event_seat_id: seat.id,
              ticket_code: ticketCode,
              qr_payload: makeQrPayload(ticketCode, order.order_code),
              unit_price_cents: seat.price_cents,
              status: 'valid'
            };
          });
          const { error: insertError } = await supabase.from('order_items').insert(items);
          if (insertError) console.error("🔴 ERRORE CREAZIONE BIGLIETTI:", insertError);
          else console.log("🟢 BIGLIETTI E QR CODE CREATI CON SUCCESSO!");
        }

        // D. Togliamo il blocco temporaneo dalla sedia
        await supabase.from('seat_locks').delete().eq('order_id', orderId);
      }

      // --- 3. GOOGLE SHEETS ---
      if (metadata?.eventId && metadata?.seats) {
        const dataSpettacolo = metadata.eventId === '8676efe4-53b8-4952-828f-1f2dd60f1c9e' ? '4 Aprile' : '5 Aprile';
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
              telefono: session.customer_details?.phone || 'N/A',
              posti: metadata.seats,
              prezzo: (session.amount_total! / 100).toFixed(2) + ' €',
              dataSpettacolo: dataSpettacolo
            }),
          });
          console.log("🟢 DATI INVIATI A EXCEL CON SUCCESSO");
        } catch (excelErr) {
          console.error("🔴 Errore di connessione a Google Sheets:", excelErr);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}