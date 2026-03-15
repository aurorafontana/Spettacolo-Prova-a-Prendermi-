import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import ClientSeatMap from './ClientSeatMap';

export const revalidate = 0; // Disabilita la cache per avere sempre i dati aggiornati

export default async function EventPage({ params }: { params: { id: string } }) {
  const supabase = getSupabaseServerClient();
  const now = new Date().toISOString();

  // --- 🧹 PULIZIA AUTOMATICA (LAZY CLEANUP) ---
  // Trova tutti i posti bloccati ('booked') di questo evento il cui timer è scaduto e li libera
  await supabase
    .from('event_seats')
    .update({ status: 'available', lock_expires_at: null })
    .eq('event_id', params.id)
    .eq('status', 'booked')
    .lt('lock_expires_at', now);
  // --------------------------------------------

  // Fetch dell'evento
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('id', params.id)
    .single();

  if (eventError || !event) {
    console.error('Evento non trovato:', eventError);
    notFound();
  }

  // Fetch della venue per layout e viewBox
  const { data: venue, error: venueError } = await supabase
    .from('venues')
    .select('*')
    .eq('id', event.venue_id)
    .single();

  if (venueError || !venue) {
    console.error('Venue non trovata:', venueError);
    notFound();
  }

  // Fetch della mappa posti per questo evento (ORA È PULITA!)
  const { data: eventSeats, error: seatsError } = await supabase
    .from('event_seats')
    .select(`
      id,
      status,
      lock_expires_at,
      venue_seat_id,
      venue_seats (
        id,
        name,
        seat_label,
        type,
        cx,
        cy,
        r,
        x,
        y,
        width,
        height,
        transform,
        d
      )
    `)
    .eq('event_id', params.id);

  if (seatsError) {
    console.error('Errore caricamento posti:', seatsError);
  }

  // Formatta i dati per il ClientComponent
  const formattedSeats = eventSeats?.map((es: any) => ({
    eventSeatId: es.id,
    venueSeatId: es.venue_seat_id,
    status: es.status,
    lock_expires_at: es.lock_expires_at,
    type: es.venue_seats?.type,
    name: es.venue_seats?.name,
    seatLabel: es.venue_seats?.seat_label,
    cx: es.venue_seats?.cx,
    cy: es.venue_seats?.cy,
    r: es.venue_seats?.r,
    x: es.venue_seats?.x,
    y: es.venue_seats?.y,
    width: es.venue_seats?.width,
    height: es.venue_seats?.height,
    transform: es.venue_seats?.transform,
    d: es.venue_seats?.d,
  })) || [];

  return (
    <main className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] p-4 sm:p-8 font-sans">
      <div className="max-w-6xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <header className="mb-8 border-b border-gray-100 pb-6 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            {event.title}
          </h1>
          <p className="text-gray-500 text-sm sm:text-base font-medium">
            {new Date(event.date).toLocaleDateString('it-IT', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </header>
        
        <ClientSeatMap 
          eventId={event.id}
          seats={formattedSeats}
          viewBox={venue.viewbox || "0 0 800 600"}
        />
      </div>
    </main>
  );
}