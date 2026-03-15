import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';
import { generateCode } from '@/lib/helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, sessionToken, customer, seatDetails } = body;

    // 1. Validazione dati in ingresso
    if (!eventId || !sessionToken || !customer?.email || !seatDetails?.length) {
      return NextResponse.json({ ok: false, error: 'Dati mancanti' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    // 2. Salvataggio o recupero del cliente
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

    // --- LOGICA TEST 1 EURO ---
    // Applichiamo il prezzo di test se viene selezionato il posto specifico
    seatDetails.forEach((seat: any) => {
      if (seat.seatName === 'PLATEA-1-1') {
        seat.finalPriceCents = 100; 
      }
    });

    const totalCents = seatDetails.reduce((sum: number, seat: any) => sum + seat.finalPriceCents, 0);
    const orderCode = generateCode('ORD');

    // 3. Creazione dell'ordine nel database
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

    // --- PREPARAZIONE METADATI DOPPI ---
    // Nomi leggibili per Excel (es: "A1, A2")
    const seatNamesString = seatDetails.map((s: any) => s.seatName).join(', ');
    
    // ID tecnici per il Webhook e il database
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

    // 4. Creazione sessione Stripe con redirect dinamico e metadati completi
    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customer.email,
      line_items: lineItems,
      metadata: {
        orderId: order.id,
        eventId: eventId,
        sessionToken: sessionToken,
        seats: seatNamesString,                // Usato dal Webhook per inviare dati a Excel
        seatIds: JSON.stringify(seatIdsArray),  // Usato dal Webhook per creare biglietti nel DB
        customerPhone: customer.phone || 'N/A'
      },
      success_url: `${baseUrl}/success?order=${order.id}`,
      // Se l'utente annulla, lo riportiamo alla pagina dell'evento specifica
      cancel_url: `${baseUrl}/events/${eventId}`,
    });

    // 5. Aggiornamento ordine con i riferimenti di Stripe
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