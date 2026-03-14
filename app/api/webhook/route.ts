import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;

    if (metadata && metadata.eventId && metadata.eventSeatIds) {
      const seatIds = JSON.parse(metadata.eventSeatIds);

      // --- 1. AGGIORNAMENTO SUPABASE ---
      try {
        await supabase
          .from('event_seats')
          .update({ status: 'sold' })
          .in('id', seatIds)
          .eq('event_id', metadata.eventId);
      } catch (dbErr) {
        console.error('Errore Database:', dbErr);
      }

      // --- 2. LOGICA DATA SPETTACOLO ---
      let eventDateName = 'Data Sconosciuta';
      if (metadata.eventId === '8676efe4-53b8-4952-828f-1f2dd60f1c9e') {
        eventDateName = '4 Aprile';
      } else if (metadata.eventId === 'd9b4c3e2-1f8a-4b7d-9c6e-5a4b3c2d1e0f') {
        eventDateName = '5 Aprile';
      }

      // --- 3. INVIO A GOOGLE SHEETS ---
      try {
        // Recuperiamo i nomi dei posti per il report
        const { data: seatsData } = await supabase
          .from('event_seats')
          .select('*, venue_seats(*)')
          .in('id', seatIds);

        const seatsList = seatsData?.map(seat => seat.venue_seats?.seat_label || 'Posto').join(', ') || 'N/A';

        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS!);
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        
        const sheets = google.sheets({ version: 'v4', auth });
        
        const rowData = [
          new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
          metadata.customerName || 'N/A',
          metadata.customerEmail || 'N/A',
          metadata.customerPhone || 'N/A',
          seatsList,
          (session.amount_total! / 100).toFixed(2) + ' €',
          'Pagato',
          eventDateName 
        ];

        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.GOOGLE_SHEET_ID!,
          range: 'Foglio1!A:H',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [rowData] },
        });

      } catch (sheetsErr) {
        console.error('Errore critico Google Sheets:', sheetsErr);
      }
    }
  }

  return NextResponse.json({ received: true });
}