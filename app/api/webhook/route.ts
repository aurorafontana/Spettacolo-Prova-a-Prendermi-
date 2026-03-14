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
    console.error(`Webhook Error: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;

    if (metadata && metadata.eventId && metadata.eventSeatIds) {
      const seatIds = JSON.parse(metadata.eventSeatIds);

      // 1. Aggiorna lo stato dei posti su Supabase a "sold"
      const { error: dbError } = await supabase
        .from('event_seats')
        .update({ status: 'sold' })
        .in('id', seatIds)
        .eq('event_id', metadata.eventId);

      if (dbError) {
        console.error('Errore aggiornamento posti Supabase:', dbError);
      } else {
        console.log(`Posti ${seatIds.join(', ')} venduti con successo per l'evento ${metadata.eventId}`);
      }

      // 2. Prepara e invia i dati a Google Sheets
      try {
        const { data: seatsData } = await supabase
          .from('event_seats')
          .select('*, venue_seats(*)')
          .in('id', seatIds);

        let seatsList = 'N/A';
        if (seatsData && seatsData.length > 0) {
          seatsList = seatsData.map(seat => {
            const vs = seat.venue_seats;
            if (!vs) return 'Posto Sconosciuto';
            if (vs.seat_label) return vs.seat_label;
            return `${vs.section_code} Fila ${vs.row_label} Posto ${vs.seat_number}`;
          }).join(', ');
        }

        // --- RICONOSCIMENTO DELLA DATA IN BASE ALL'ID ---
        let eventDateName = 'Data Sconosciuta';
        if (metadata.eventId === '8676efe4-53b8-4952-828f-1f2dd60f1c9e') {
          eventDateName = '4 Aprile';
        } else if (metadata.eventId === 'd9b4c3e2-1f8a-4b7d-9c6e-5a4b3c2d1e0f') {
          eventDateName = '5 Aprile';
        }

        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS!);
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

        // --- CREAZIONE DELLA RIGA CON 8 COLONNE (Fino alla H) ---
        const rowData = [
          new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
          metadata.customerName || 'N/A',
          metadata.customerEmail || 'N/A',
          metadata.customerPhone || 'N/A',
          seatsList,
          (session.amount_total! / 100).toFixed(2) + ' €',
          session.payment_status === 'paid' ? 'Pagato' : 'In Sospeso',
          eventDateName // <--- ECCO LA MAGIA NELL'OTTAVA COLONNA
        ];

        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Foglio1!A:H', // <--- AGGIORNATO DA A:G AD A:H
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [rowData],
          },
        });

        console.log('Dati aggiunti a Google Sheets con successo');
      } catch (sheetsError) {
        console.error('Errore inserimento in Google Sheets:', sheetsError);
      }
    }
  }

  return NextResponse.json({ received: true });
}