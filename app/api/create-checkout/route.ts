import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';
import { generateCode } from '@/lib/helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // 1. Riceviamo i dettagli dal frontend
    const { eventId, sessionToken, customer, seatDetails } = body;

    if (!eventId || !sessionToken || !customer?.email || !seatDetails?.length) {
      return NextResponse.json({ ok: false, error: 'Dati mancanti per il checkout' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    // 2. Salva o recupera il cliente nel database
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

    if (customerError) throw new Error(`Errore salvataggio cliente: ${customerError.message}`);

    // 3. Calcola il totale
    const totalCents = seatDetails.reduce((sum: number, seat: any) => sum + seat.finalPriceCents, 0);
    const orderCode = generateCode('ORD');

    // 4. Crea l'ordine in attesa di pagamento
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

    if (orderError) throw new Error(`Errore creazione ordine: ${orderError.message}`);

    // 5. Prepara i nomi dei posti per Excel (es: "PLATEA-2-6, CASETTA DX")
    const seatNamesString = seatDetails
      .map((s: any) => s.seatName || 'Posto')
      .join(', ')
      .substring(0, 490);

    // 6. Prepara gli oggetti per il carrello Stripe
    const lineItems = seatDetails.map((seat: any) => {
      let itemName = "Biglietto Spettacolo";
      
      if (seat.ticketType === 'stanza_privata') {
        itemName = `Prenotazione ${seat.seatName || 'Casetta/Box'}`;
      } else if (seat.ticketType === 'ridotto') {
        itemName = `Biglietto Ridotto - Posto ${seat.seatName}`;
      } else {
        itemName = `Biglietto Adulto - Posto ${seat.seatName}`;
      }

      return {
        quantity: 1,
        price_data: {
          currency: 'eur',
          product_data: { 
            name: itemName,
            description: `Evento: Prova a Prendermi`
          },
          unit_amount: seat.finalPriceCents
        }
      };
    });

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://spettacolo-prova-a-prendermi.vercel.app';

    // 7. Crea la sessione di pagamento Stripe
    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customer.email,
      line_items: lineItems,
      // --- MODIFICA 1: Attiviamo la richiesta del telefono su Stripe ---
      phone_number_collection: {
        enabled: true,
      },
      metadata: {
        orderId: order.id,
        eventId,
        sessionToken,
        seats: seatNamesString,
        // --- MODIFICA 2: Inviamo a Stripe il telefono inserito sul sito ---
        customerPhone: customer.phone || 'N/A' 
      },
      success_url: `${baseUrl}/success?order=${orderCode}`,
      cancel_url: `${baseUrl}/cancel?order=${orderCode}`
    });

    // 8. Aggiorna l'ordine con il link di pagamento
    await supabase
      .from('orders')
      .update({ 
        stripe_session_id: stripeSession.id, 
        payment_url: stripeSession.url 
      })
      .eq('id', order.id);

    return NextResponse.json({ ok: true, url: stripeSession.url, orderCode });

  } catch (error: any) {
    console.error('Checkout Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}