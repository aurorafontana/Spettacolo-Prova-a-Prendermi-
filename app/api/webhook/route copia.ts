import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

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

      // --- 1. SUPABASE: AGGIORNAMENTO ORDINE CON LOG E 'completed' ---
      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({ status: 'completed', paid_at: new Date().toISOString() }) 
        .eq('id', orderId)
        .select();

      if (updateError) {
        console.error("🔴 ERRORE SUPABASE UPDATE ORDINE:", updateError);
      } else {
        console.log("🟢 ORDINE AGGIORNATO CON SUCCESSO SU SUPABASE:", updatedOrder);
      }

      // --- 2. SUPABASE: SBLOCCO POSTI E MAPPA ---
      const { data: locks } = await supabase
        .from('seat_locks')
        .select('event_seat_id')
        .eq('order_id', orderId);

      if (locks && locks.length > 0) {
        const seatIds = locks.map(l => l.event_seat_id);
        
        const { error: seatError } = await supabase.from('event_seats').update({ status: 'sold' }).in('id', seatIds);
        if (seatError) console.error("🔴 ERRORE SUPABASE UPDATE POSTI:", seatError);
        
        await supabase.from('seat_locks').delete().eq('order_id', orderId);
        console.log("🟢 POSTI AGGIORNATI E SBLOCCATI SULLA MAPPA");
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