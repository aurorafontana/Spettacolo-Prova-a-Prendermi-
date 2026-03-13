import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';
import { generateCode } from '@/lib/helpers';

export async function POST(req: NextRequest) {
  const body = await req.json();
  
  // 1. Ora riceviamo TUTTI i dettagli esatti dal frontend (compresi i tipi di biglietto e i prezzi)
  const { eventId, sessionToken, customer, seatDetails } = body;

  if (!eventId || !sessionToken || !customer?.email || !seatDetails?.length) {
    return NextResponse.json({ ok: false, error: 'Missing checkout data' }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  // 2. Salva il cliente nel database
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

  // 3. Calcola il totale esatto usando i prezzi che vediamo a schermo
  const totalCents = seatDetails.reduce((sum: number, seat: any) => sum + seat.finalPriceCents, 0);
  const orderCode = generateCode('ORD');

  // 4. Crea l'ordine fittizio in attesa di pagamento
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

  // 5. Prepara i biglietti per la cassa di Stripe (rispettando Casette e Ridotti!)
  const lineItems = seatDetails.map((seat: any, idx: number) => {
    let name = `Biglietto Posto #${idx + 1}`;
    if (seat.ticketType === 'stanza_privata') name = 'Stanza Privata / Box Disabili';
    else if (seat.ticketType === 'ridotto') name = 'Biglietto Ridotto (Under 13)';
    else name = 'Biglietto Adulto';

    return {
      quantity: 1,
      price_data: {
        currency: 'eur',
        product_data: { name },
        unit_amount: seat.finalPriceCents
      }
    };
  });

  // Leggiamo l'indirizzo del tuo sito (in base alle tue variabili su Vercel)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://spettacolo-prova-a-prendermi.vercel.app';

  // 6. Crea la sessione di pagamento Stripe
  const stripeSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: customer.email,
    line_items: lineItems,
    metadata: {
      orderId: order.id,
      eventId,
      sessionToken
    },
    success_url: `${baseUrl}/success?order=${orderCode}`,
    cancel_url: `${baseUrl}/cancel?order=${orderCode}`}`
  });

  await supabase
    .from('orders')
    .update({ stripe_session_id: stripeSession.id, payment_url: stripeSession.url })
    .eq('id', order.id);

  // Risponde al tuo sito passandogli l'url esatto in cui saltare
  return NextResponse.json({ ok: true, url: stripeSession.url, orderCode });
}