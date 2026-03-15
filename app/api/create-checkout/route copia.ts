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

    // --- INIZIO TRUCCO ADMIN PER TEST A 1 EURO ---
    // ATTENZIONE: Ricordati di rimuovere queste righe dopo il test!
    seatDetails.forEach((seat: any) => {
      if (seat.seatName === 'PLATEA-1-1') {
        seat.finalPriceCents = 100; // Forza il prezzo a 1,00 € (100 centesimi)
      }
    });
    // --- FINE TRUCCO ADMIN ---

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
      // Calcoliamo la data in base all'ID dell'evento
      const dataTesto = eventId === '8676efe4-53b8-4952-828f-1f2dd60f1c9e' ? '4 Aprile' : '5 Aprile';
      
      // Prepariamo l'intestazione (Nome e Cognome) in maiuscolo per risaltare
      const intestatario = `${customer.firstName} ${customer.lastName}`.toUpperCase();

      let tipoTicket = "Biglietto Adulto";
      if (seat.ticketType === 'stanza_privata') {
        tipoTicket = "Prenotazione Casetta";
      } else if (seat.ticketType === 'ridotto') {
        tipoTicket = "Biglietto Ridotto";
      }

      // UNIAMO TUTTO NEL NOME: Stripe mostrerà questo titolo chiaramente nella ricevuta
      const nomeCompletoProdotto = `${tipoTicket} - Posto ${seat.seatName || ''} | ${dataTesto} | ${intestatario}`;

      return {
        quantity: 1,
        price_data: {
          currency: 'eur',
          product_data: { 
            name: nomeCompletoProdotto,
            description: `Evento: Prova a Prendermi - Teatro Centrale Carbonia`
          },
          unit_amount: seat.finalPriceCents
        }
      };
    });

    // --- NUOVA LOGICA PER IL TASTO INDIETRO ---
    // Scegliamo dove rimandare l'utente se annulla, in base all'ID dell'evento
    let cancelPath = '/';
    if (eventId === '8676efe4-53b8-4952-828f-1f2dd60f1c9e') {
      cancelPath = '/events/prova-a-prendermi'; // Ritorno al 4 Aprile
    } else if (eventId === 'd9b4c3e2-1f8a-4b7d-9c6e-5a4b3c2d1e0f') {
      cancelPath = '/events/prova-a-prendermi-5-aprile'; // Ritorno al 5 Aprile
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://spettacolo-prova-a-prendermi.vercel.app';

    // 7. Crea la sessione di pagamento Stripe
    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customer.email,
      line_items: lineItems,
      phone_number_collection: {
        enabled: true,
      },
      metadata: {
        orderId: order.id,
        eventId,
        sessionToken,
        seats: seatNamesString,
        customerPhone: customer.phone || 'N/A' 
      },
      // Passiamo il vero ID ordine e i posti alla pagina di successo
      success_url: `${baseUrl}/success?order=${order.id}&seats=${encodeURIComponent(seatNamesString)}`,
      // Passiamo il link dinamico per il ritorno
      cancel_url: `${baseUrl}${cancelPath}`
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