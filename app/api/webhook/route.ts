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
      console.log(`🟡 ANALISI WEBHOOK PER ORDINE: ${orderId}`);

      // --- 1. RECUPERO POSTI BLOCCATI (LO FACCIAMO PER PRIMO!) ---
      const { data: locks, error: locksError } = await supabase
        .from('seat_locks')
        .select('event_seat_id')
        .eq('order_id', orderId);

      console.log(`🔍 POSTI INDIVIDUATI NEI LOCKS: ${locks?.length || 0}`);

      // --- 2. AGGIORNAMENTO STATO ORDINE ---
      const { data: order, error: updateError } = await supabase
        .from('orders')
        .update({ status: 'paid', paid_at: new Date().toISOString() }) 
        .eq('id', orderId)
        .select('id, order_code')
        .single();

      if (updateError) {
        console.error("🔴 ERRORE UPDATE ORDINE SU SUPABASE:", updateError);
        // Se fallisce l'ordine, ci fermiamo per non creare biglietti fantasma
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
      }
      
      console.log(`🟢 ORDINE AGGIORNATO: ${order?.order_code}`);

      // --- 3. CREAZIONE BIGLIETTI E SBLOCCO MAPPA ---
      if (locks && locks.length > 0 && order) {
        const seatIds = locks.map(l => l.event_seat_id);
        
        // A. Segna i posti come venduti
        await supabase.from('event_seats').update({ status: 'sold', lock_expires_at: null }).in('id', seatIds);
        
        // B. Recupera prezzi per generare i biglietti
        const { data: soldSeats } = await supabase.from('event_seats').select('id, price_cents').in('id', seatIds);

        if (soldSeats?.length) {
          console.log(`🟡 GENERAZIONE DI ${soldSeats.length} BIGLIETTI...`);
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
          if (insertError) console.error("🔴 ERRORE INSERIMENTO BIGLIETTI:", insertError);
          else console.log("🟢 BIGLIETTI SALVATI CORRETTAMENTE!");
        }

        // C. Elimina i blocchi temporanei
        await supabase.from('seat_locks').delete().eq('order_id', orderId);
      } else {
        console.warn("⚠️ ATTENZIONE: Nessun lock trovato. I biglietti non verranno creati.");
      }

      // --- 4. INVIO A GOOGLE SHEETS (RIPRISTINATO AL 100%) ---
      if (metadata?.eventId && metadata?.seats) {
        console.log("🟡 INVIO DATI A GOOGLE SHEETS...");
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
          console.log("🟢 EXCEL AGGIORNATO CON SUCCESSO");
        } catch (excelErr) {
          console.error("🔴 ERRORE EXCEL:", excelErr);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}