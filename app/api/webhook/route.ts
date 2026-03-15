import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';
import { generateCode } from '@/lib/helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, sessionToken, customer, seatDetails } = body;

    // Validazione base
    if (!eventId || !sessionToken || !customer?.email || !seatDetails?.length) {
      return NextResponse.json({ ok: false, error: 'Dati mancanti' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    // 1. Salvataggio o recupero cliente
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

    if (customerError) throw new Error(customerError.message);

    // --- LOGICA PREZZI E CODICI ---
    // Applichiamo il trucco del test a 1€ se il posto è PLATEA-1-1
    seatDetails.forEach((seat: any) => {
      if (seat.seatName === 'PLATEA-1-1') {
        seat.finalPriceCents = 100; // 1 Euro per il test
      }
    });

    const totalCents = seatDetails.reduce((sum: number, seat: any) => sum + seat.finalPriceCents, 0);
    const orderCode = generateCode('ORD');

    // 2. Creazione dell'ordine nel database
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

    if (orderError) throw new Error(orderError.message);

    // --- PREPARAZIONE DATI PER STRIPE (DOPPIA LOGICA) ---
    
    // A. Nomi leggibili per il tuo Excel (es: "A1, A2")
    const seatNamesString = seatDetails.map((s: any) => s.seatName).join(', ');
    
    // B. ID tecnici per il Webhook/Database (es: "uuid1, uuid2")
    const seatIdsArray = seatDetails.map((s: any) => s.eventSeatId || s.id);

    const lineItems = seatDetails.map((seat: any) => ({
      quantity: 1,
      price_data: {
        currency: 'eur',
        product_data: {
          name: `Posto ${seat.seatName} - ${customer.firstName} ${customer.lastName}`.toUpperCase(),
        },
        unit_amount: seat.finalPriceCents,
      },
    }));

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://spettacolo-prova-a-prendermi.vercel.app';

    // 3. Creazione sessione Stripe con Metadati completi
    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customer.email,
      line_items: lineItems,
      metadata: {
        orderId: order.id,
        eventId: eventId,
        sessionToken: sessionToken,
        seats: seatNamesString,                // Leggibile per Excel
        seatIds: JSON.stringify(seatIdsArray),  // Tecnico per il database
        customerPhone: customer.phone || 'N/A'
      },
      success_url: `${baseUrl}/success?order=${order.id}`,
      cancel_url: `${baseUrl}/`,
    });

    // 4. Aggiornamento ordine con ID sessione Stripe
    await supabase
      .from('orders')
      .update({
        stripe_session_id: stripeSession.id,
        payment_url: stripeSession.url,
      })
      .eq('id', order.id);

    return NextResponse.json({ ok: true, url: stripeSession.url });

  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}