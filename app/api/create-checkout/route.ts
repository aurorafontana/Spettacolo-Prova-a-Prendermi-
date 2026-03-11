import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';
import { generateCode } from '@/lib/helpers';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { eventId, eventSeatIds, sessionToken, customer } = body;

  if (!eventId || !eventSeatIds?.length || !sessionToken || !customer?.email) {
    return NextResponse.json({ ok: false, error: 'Missing checkout data' }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const { data: seats, error: seatsError } = await supabase
    .from('event_seats')
    .select('id, price_cents, status')
    .in('id', eventSeatIds);

  if (seatsError) return NextResponse.json({ ok: false, error: seatsError.message }, { status: 500 });
  if (!seats || seats.some(s => s.status !== 'locked')) {
    return NextResponse.json({ ok: false, error: 'Seats must be locked first' }, { status: 409 });
  }

  const { data: customerRow, error: customerError } = await supabase
    .from('customers')
    .insert({
      first_name: customer.firstName,
      last_name: customer.lastName,
      email: customer.email,
      phone: customer.phone || null
    })
    .select('id')
    .single();

  if (customerError) return NextResponse.json({ ok: false, error: customerError.message }, { status: 500 });

  const totalCents = seats.reduce((sum, s) => sum + s.price_cents, 0);
  const orderCode = generateCode('ORD');

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      event_id: eventId,
      customer_id: customerRow.id,
      order_code: orderCode,
      session_token: sessionToken,
      status: 'payment_pending',
      total_cents: totalCents,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    })
    .select('id')
    .single();

  if (orderError) return NextResponse.json({ ok: false, error: orderError.message }, { status: 500 });

  await supabase.from('seat_locks').update({ order_id: order.id }).in('event_seat_id', eventSeatIds);

  const stripeSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: customer.email,
    line_items: seats.map((seat, idx) => ({
      quantity: 1,
      price_data: {
        currency: 'eur',
        product_data: { name: `Biglietto Teatro Carbonia #${idx + 1}` },
        unit_amount: seat.price_cents
      }
    })),
    metadata: {
      orderId: order.id,
      eventId,
      sessionToken
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/events/success?order=${orderCode}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/events/cancel?order=${orderCode}`
  });

  await supabase
    .from('orders')
    .update({ stripe_session_id: stripeSession.id, payment_url: stripeSession.url })
    .eq('id', order.id);

  return NextResponse.json({ ok: true, checkoutUrl: stripeSession.url, orderCode });
}
