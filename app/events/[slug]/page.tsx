import { notFound } from 'next/navigation';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';
import ClientSeatMap from './ClientSeatMap'; 

// 1. Forza il caricamento dinamico per pulire i posti scaduti ad ogni refresh
export const revalidate = 0; 

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  // In Next.js 15+, i params vanno "attesi" (await)
  const { slug } = await params;
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();

  // --- 🧹 PULIZIA AUTOMATICA (LAZY CLEANUP) ---
  // Cerchiamo l'evento tramite slug per ottenere l'ID necessario alla pulizia
  const { data: eventCleanup } = await supabase
    .from('events')
    .select('id')
    .eq('slug', slug)
    .single();

  if (eventCleanup) {
    await supabase
      .from('event_seats')
      .update({ status: 'available', lock_expires_at: null })
      .eq('event_id', eventCleanup.id)
      .eq('status', 'booked')
      .lt('lock_expires_at', now);
  }
  // --------------------------------------------

  // 2. RECUPERO DATI EVENTO
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .single();

  if (eventError || !event) {
    notFound();
  }

  // 3. RECUPERO DATI VENUE (Per il viewBox della mappa)
  const { data: venue } = await supabase
    .from('venues')
    .select('*')
    .eq('id', event.venue_id)
    .single();

  // 4. RECUPERO POSTI AGGIORNATI
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
    .eq('event_id', event.id);

  if (seatsError) {
    console.error('Errore caricamento posti:', seatsError);
  }

  // 5. FORMATTAZIONE DATI PER IL COMPONENTE CLIENT
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
          viewBox={venue?.viewbox || "0 0 800 600"}
        />
      </div>
    </main>
  );
}