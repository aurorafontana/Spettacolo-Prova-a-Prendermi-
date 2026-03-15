import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

// Usiamo la chiave "Service Role" per bypassare i blocchi di sicurezza
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: "Errore Firma Stripe" }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;
    const orderId = metadata?.orderId; // Recuperiamo l'ID dell'ordine

    if (orderId) {
      // 1. SUPABASE: Diciamo finalmente al database che l'ordine è PAGATO!
      await supabase
        .from('orders')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', orderId);

      // 2. Troviamo i posti che erano stati bloccati per questo ordine (serve per gli ID corretti)
      const { data: locks } = await supabase
        .from('seat_locks')
        .select('event_seat_id')
        .eq('order_id', orderId);

      // 3. SUPABASE: Aggiorniamo la mappa in modo corretto
      if (locks && locks.length > 0) {
        const seatIds = locks.map(l => l.event_seat_id);

        // Rendiamo i posti 'sold' (venduti) sulla mappa
        await supabase
          .from('event_seats')
          .update({ status: 'sold' })
          .in('id', seatIds);

        // Cancelliamo il blocco temporaneo che teneva il posto "arancione"
        await supabase
          .from('seat_locks')
          .delete()
          .eq('order_id', orderId);
      }

      // 4. GOOGLE SHEETS: Invio dati per il tuo file Excel
      if (metadata?.eventId && metadata?.seats) {
        const dataSpettacolo = metadata.eventId === '8676efe4-53b8-4952-828f-1f2dd60f1c9e' ? '4 Aprile' : '5 Aprile';
        const googleUrl = "https://script.google.com/macros/s/AKfycbxXjYsXrp2mu7P7CuyCPU0I4-_tyXwr5HFb0lekU12Jd9XVKW73WA4NyooyFcvbHkZ1/exec";
        
        try {
          await fetch(googleUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              dataOrdine: new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
              codiceOrdine: orderId || 'N/A',
              nome: session.customer_details?.name || 'N/A',
              email: session.customer_details?.email || 'N/A',
              telefono: session.customer_details?.phone || 'N/A',
              posti: metadata.seats,
              prezzo: (session.amount_total! / 100).toFixed(2) + ' €',
              dataSpettacolo: dataSpettacolo
            }),
          });
        } catch (excelErr) {
          console.error("Errore di connessione a Google:", excelErr);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}