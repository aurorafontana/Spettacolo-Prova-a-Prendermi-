import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { generateCode, makeQrPayload } from '@/lib/helpers';

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
    console.error(`🔴 Errore firma Webhook: ${err.message}`);
    return NextResponse.json({ error: "Errore Firma Stripe" }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;
    const orderId = metadata?.orderId; 

    if (orderId) {
      console.log(`🟡 ANALISI ORDINE: ${orderId}`);

      // 1. AGGIORNAMENTO STATO
      const { data: order, error: updateError } = await supabase
        .from('orders')
        .update({ status: 'paid', paid_at: new Date().toISOString() }) 
        .eq('id', orderId)
        .select('id, order_code')
        .single();

      if (updateError) {
        console.error("🔴 ERRORE UPDATE ORDINE:", updateError);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
      }
      
      console.log(`🟢 ORDINE TROVATO: ${order?.order_code}`);

      // 2. RECUPERO POSTI BLOCCATI
      const { data: locks, error: locksError } = await supabase
        .from('seat_locks')
        .select('event_seat_id')
        .eq('order_id', orderId);

      console.log(`🔍 POSTI BLOCCATI TROVATI: ${locks?.length || 0}`);

      if (locks && locks.length > 0) {
        const seatIds = locks.map(l => l.event_seat_id);
        
        // A. Aggiorna stato posti
        await supabase.from('event_seats').update({ status: 'sold', lock_expires_at: null }).in('id', seatIds);
        
        // B. Recupera prezzi per biglietti
        const { data: soldSeats } = await supabase.from('event_seats').select('id, price_cents').in('id', seatIds);
        console.log(`🔍 DATI POSTI RECUPERATI: ${soldSeats?.length || 0}`);

        // C. CREAZIONE BIGLIETTI
        if (soldSeats?.length && order) {
          console.log("🟡 GENERAZIONE BIGLIETTI IN CORSO...");
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

          const { error: insertError } = await supabase.from('order_items').insert(items);
          
          if (insertError) {
            console.error("🔴 ERRORE INSERIMENTO BIGLIETTI:", insertError);
          } else {
            console.log("🟢 BIGLIETTI CREATI E SALVATI IN ORDER_ITEMS!");
          }
        } else {
          console.log("⚠️ SALTO CREAZIONE BIGLIETTI: Dati mancanti (check soldSeats o order)");
        }

        // D. Pulizia finale
        await supabase.from('seat_locks').delete().eq('order_id', orderId);
      } else {
        console.log("⚠️ NESSUN POSTO TROVATO IN SEAT_LOCKS PER QUESTO ORDINE.");
      }

      // 3. GOOGLE SHEETS (già funzionante)
      // ... (il resto del codice rimane uguale)
    }
  }

  return NextResponse.json({ received: true });
}