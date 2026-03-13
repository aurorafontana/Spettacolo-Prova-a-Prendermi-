import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
// Il tuo link segreto di Google Sheets:
const GOOGLE_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyXTOVE9MQqzpMgTkVOatLvYsLWwvbPNHxe3q7uIcZRUEmjj1C0dyHn7r0sOEHN87nF/exec';

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event;

  try {
    // Verifica che il messaggio arrivi davvero da Stripe (sicurezza massima)
    event = stripe.webhooks.constructEvent(payload, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Se il pagamento è andato a buon fine...
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;

    if (orderId) {
      const supabase = getSupabaseServiceClient();

      // 1. Aggiorna l'ordine su Supabase come PAGATO
      await supabase
        .from('orders')
        .update({ status: 'paid' })
        .eq('id', orderId);

      // 2. Recupera i dati del cliente per mandarli a Google
      const { data: orderData } = await supabase
        .from('orders')
        .select(`
          order_code,
          total_cents,
          customers (first_name, last_name, email, phone)
        `)
        .eq('id', orderId)
        .single();

      if (orderData) {
        const customer = orderData.customers as any;
        
        // 3. Prepara il pacchetto per il tuo Foglio Google
        const googleData = {
          orderCode: orderData.order_code,
          customerName: `${customer.first_name} ${customer.last_name}`,
          email: customer.email,
          phone: customer.phone || '-',
          seats: 'Vedi database per i posti esatti', 
          total: `€ ${(orderData.total_cents / 100).toFixed(2)}`
        };

        // 4. Spedisce i dati a Google Sheets!
        await fetch(GOOGLE_WEBHOOK_URL, {
          method: 'POST',
          body: JSON.stringify(googleData)
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}