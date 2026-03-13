import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
// Il tuo link segreto di Google Sheets (già aggiornato)
const GOOGLE_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyXTOVE9MQqzpMgTkVOatLvYsLWwvbPNHxe3q7uIcZRUEmjj1C0dyHn7r0sOEHN87nF/exec';

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event;

  try {
    // 1. Verifica che il messaggio arrivi davvero da Stripe
    event = stripe.webhooks.constructEvent(payload, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error(`❌ Webhook Signature Error: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // 2. Se il pagamento è stato completato con successo
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    
    // Recuperiamo i nomi dei posti che abbiamo salvato nei metadata durante il checkout
    const sessionSeats = session.metadata?.seats || 'Dettaglio posti non disponibile';

    if (orderId) {
      const supabase = getSupabaseServiceClient();

      // A. Aggiorna l'ordine su Supabase come PAGATO
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'paid' })
        .eq('id', orderId);

      if (updateError) {
        console.error(`❌ Errore aggiornamento database: ${updateError.message}`);
      }

      // B. Recupera i dati completi per Google Sheets
      const { data: orderData, error: fetchError } = await supabase
        .from('orders')
        .select(`
          order_code,
          total_cents,
          customers (first_name, last_name, email, phone)
        `)
        .eq('id', orderId)
        .single();

      if (orderData && !fetchError) {
        const customer = orderData.customers as any;
        
        // C. Prepara il pacchetto dati per Google Sheets
        const googleData = {
          orderCode: orderData.order_code,
          customerName: customer ? `${customer.first_name} ${customer.last_name}` : 'Cliente non trovato',
          email: customer?.email || 'N/A',
          phone: customer?.phone || '-',
          seats: sessionSeats, // <-- Invia la stringa dei nomi dei posti (es: Platea 1-5, Casetta DX)
          total: `€ ${(orderData.total_cents / 100).toFixed(2)}`
        };

        // D. Spedisce i dati al tuo link Google
        try {
          await fetch(GOOGLE_WEBHOOK_URL, {
            method: 'POST',
            body: JSON.stringify(googleData)
          });
          console.log(`✅ Dati inviati correttamente a Google Sheets per ordine: ${orderData.order_code}`);
        } catch (googleErr) {
          console.error(`❌ Errore invio a Google Sheets:`, googleErr);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}