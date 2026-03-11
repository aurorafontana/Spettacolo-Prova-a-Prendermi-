import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';
import { generateCode, makeQrPayload } from '@/lib/helpers';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = (await headers()).get('stripe-signature');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (!orderId) return NextResponse.json({ ok: false, error: 'Missing orderId metadata' }, { status: 400 });

    const supabase = getSupabaseServiceClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_code')
      .eq('id', orderId)
      .single();

    if (orderError || !order) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });

    const { data: locks, error: locksError } = await supabase
      .from('seat_locks')
      .select('event_seat_id')
      .eq('order_id', orderId);

    if (locksError) return NextResponse.json({ ok: false, error: locksError.message }, { status: 500 });

    const seatIds = (locks || []).map(l => l.event_seat_id);

    await supabase.from('orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', orderId);
    await supabase.from('event_seats').update({ status: 'sold', lock_expires_at: null }).in('id', seatIds);

    const { data: soldSeats } = await supabase
      .from('event_seats')
      .select('id, price_cents')
      .in('id', seatIds);

    if (soldSeats?.length) {
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
      await supabase.from('order_items').insert(items);
    }

    await supabase.from('seat_locks').delete().eq('order_id', orderId);
  }

  return NextResponse.json({ ok: true });
}
