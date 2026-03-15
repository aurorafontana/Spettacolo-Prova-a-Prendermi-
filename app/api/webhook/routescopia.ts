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
    return NextResponse.json({ error: "Errore Firma Stripe" }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;

    if (metadata?.eventId && metadata?.seats) {
      const seatList = metadata.seats.split(',').map(s => s.trim());
      const dataSpettacolo = metadata.eventId === '8676efe4-53b8-4952-828f-1f2dd60f1c9e' ? '4 Aprile' : '5 Aprile';

      // 1. Aggiorna Supabase (Mappa)
      await supabase.from('event_seats').update({ status: 'sold' }).in('id', seatList).eq('event_id', metadata.eventId);

      // 2. Invia a Google Sheets
      try {
        const googleUrl = "https://script.google.com/macros/s/AKfycbxXjYsXrp2mu7P7CuyCPU0I4-_tyXwr5HFb0lekU12Jd9XVKW73WA4NyooyFcvbHkZ1/exec";
        
        await fetch(googleUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            dataOrdine: new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
            codiceOrdine: metadata.orderId || 'N/A', // <--- INVIAMO IL VERO ID DELL'ORDINE
            nome: session.customer_details?.name || 'N/A',
            email: session.customer_details?.email || 'N/A',
            telefono: session.customer_details?.phone || 'N/A',
            posti: metadata.seats, // <--- INVIAMO I NOMI DEI POSTI (Es: PLATEA-15-3)
            prezzo: (session.amount_total! / 100).toFixed(2) + ' €',
            dataSpettacolo: dataSpettacolo
          }),
        });
      } catch (excelErr) {
        console.error("Errore di connessione a Google:", excelErr);
      }
    }
  }

  return NextResponse.json({ received: true });
}