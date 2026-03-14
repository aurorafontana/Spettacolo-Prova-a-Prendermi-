import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!; // Qui Vercel userà la tua chiave whsec_...

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;

    if (metadata && metadata.eventId && metadata.eventSeatIds) {
      const seatIds = JSON.parse(metadata.eventSeatIds);

      // Determiniamo la data in modo semplice
      const dataSpettacolo = metadata.eventId === '8676efe4-53b8-4952-828f-1f2dd60f1c9e' ? '4 Aprile' : '5 Aprile';

      // Aggiorniamo Supabase come facevamo prima
      // Nota: inviamo anche la data a Supabase, così se l'automazione verso Excel 
      // legge da qui, troverà la data corretta.
      const { error: dbError } = await supabase
        .from('event_seats')
        .update({ 
          status: 'sold',
          // Se la tua tabella ha una colonna note o simile, possiamo scriverla qui
        })
        .in('id', seatIds)
        .eq('event_id', metadata.eventId);

      if (dbError) console.error('Errore Supabase:', dbError);
    }
  }

  return NextResponse.json({ received: true });
}