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

    if (metadata?.eventId && metadata?.eventSeatIds) {
      const seatIds = JSON.parse(metadata.eventSeatIds);
      
      // Calcoliamo la data dello spettacolo
      const dataSpettacolo = metadata.eventId === '8676efe4-53b8-4952-828f-1f2dd60f1c9e' ? '4 Aprile' : '5 Aprile';

      // 1. Aggiorniamo Supabase (I posti tornano a diventare arancioni)
      await supabase
        .from('event_seats')
        .update({ status: 'sold' })
        .in('id', seatIds)
        .eq('event_id', metadata.eventId);

      // 2. Invio a Excel tramite il tuo link Apps Script
      try {
        const googleUrl = "https://script.google.com/macros/s/AKfycbyXTOVE9MQqzpMgTkVOatLvYsLWwvbPNHxe3q7uIcZRUEmjj1C0dyHn7r0sOEHN87nF/exec";
        
        // Peschiamo i dati REALI che il cliente (es. Mario Rossi) ha inserito al checkout
        const nomeCliente = session.customer_details?.name || metadata?.customerName || 'N/A';
        const emailCliente = session.customer_details?.email || metadata?.customerEmail || 'N/A';
        const telefonoCliente = session.customer_details?.phone || metadata?.customerPhone || 'N/A';

        await fetch(googleUrl, {
          method: 'POST',
          // Abbiamo RIMOSSO mode: 'no-cors' per inviare correttamente il JSON
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            dataOrdine: new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
            nome: nomeCliente,
            email: emailCliente,
            telefono: telefonoCliente,
            posti: seatIds.length,
            prezzo: (session.amount_total! / 100).toFixed(2) + ' €',
            dataSpettacolo: dataSpettacolo // <--- INVIO DELLA NUOVA COLONNA H
          }),
        });
        console.log("Inviato a Google Sheets con successo");
      } catch (excelErr) {
        console.error("Errore invio a Google Script:", excelErr);
      }
    }
  }

  return NextResponse.json({ received: true });
}