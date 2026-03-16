import BookingClient from '@/components/BookingClient';
import { notFound } from 'next/navigation';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

// Forza il ricalcolo della pagina ad ogni refresh per avere i posti sempre aggiornati
export const revalidate = 0; 

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();

  // --- 🧹 PULIZIA AUTOMATICA (LAZY CLEANUP) ---
  // 1. Troviamo prima l'ID dell'evento usando lo slug
  const { data: eventForCleanup } = await supabase
    .from('events')
    .select('id')
    .eq('slug', slug)
    .single();

  // 2. Se l'evento esiste, puliamo i posti scaduti prima di caricare la mappa
  if (eventForCleanup) {
    await supabase
      .from('event_seats')
      .update({ status: 'available', lock_expires_at: null })
      .eq('event_id', eventForCleanup.id)
      .eq('status', 'booked')
      .lt('lock_expires_at', now);
  }
  // --------------------------------------------

  // Fetch dell'evento (Il tuo codice originale)
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!event) return <div>Evento non trovato</div>;

  // Fetch dei posti aggiornati (Il tuo codice originale)
  const { data: seats } = await supabase
    .from('event_seats')
    .select('id,status,price_cents,venue_seats(section_code,row_label,seat_number,seat_label,x_coord,y_coord,seat_radius,physical_block)')
    .eq('event_id', event.id)
    .order('created_at', { ascending: true });

  // Carica il tuo componente BookingClient originale
  return <BookingClient event={event} seats={seats || []} />;
}