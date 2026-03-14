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
    return NextResponse.json({ error: "Firma non valida" }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;

    if (metadata?.eventId && metadata?.eventSeatIds) {
      const seatIds = JSON.parse(metadata.eventSeatIds);

      // Aggiorniamo Supabase: segna i posti come venduti
      const { error } = await supabase
        .from('event_seats')
        .update({ status: 'sold' })
        .in('id', seatIds)
        .eq('event_id', metadata.eventId);

      if (error) console.error("Errore Supabase:", error.message);
    }
  }

  return NextResponse.json({ received: true });
}