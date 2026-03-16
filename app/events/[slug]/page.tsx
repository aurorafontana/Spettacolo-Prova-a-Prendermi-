import BookingClient from '@/components/BookingClient';
import { notFound } from 'next/navigation';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

// Forza il ricalcolo della pagina ad ogni refresh
export const revalidate = 0; 

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();

  // 1. Troviamo l'ID dell'evento
  const { data: eventForCleanup } = await supabase
    .from('events')
    .select('id')
    .eq('slug', slug)
    .single();

  // --- 🧹 PULIZIA AUTOMATICA PROFONDA (LAZY CLEANUP) ---
  if (eventForCleanup) {
    try {
      // FASE A: Gestione degli Ordini Scaduti
      // Troviamo gli ordini pendenti che hanno superato il limite di tempo
      const { data: expiredOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'payment_pending')
        .lt('expires_at', now);

      if (expiredOrders && expiredOrders.length > 0) {
        const expiredOrderIds = expiredOrders.map(o => o.id);

        // Scopriamo quali posti erano bloccati da questi ordini
        const { data: locks } = await supabase
          .from('seat_locks')
          .select('event_seat_id')
          .in('order_id', expiredOrderIds);

        if (locks && locks.length > 0) {
          const seatIdsToFree = locks.map(l => l.event_seat_id);

          // 1. Ricolora i posti di verde sulla mappa
          await supabase
            .from('event_seats')
            .update({ status: 'available', lock_expires_at: null })
            .in('id', seatIdsToFree);
        }

        // 2. Elimina i blocchi fisici e metti l'ordine definitivamente in 'expired'
        await supabase.from('seat_locks').delete().in('order_id', expiredOrderIds);
        await supabase.from('orders').update({ status: 'expired' }).in('id', expiredOrderIds);
      }

      // FASE B: Pulizia dei blocchi isolati (Seat Locks senza ordine)
      // A volte il posto si blocca prima ancora di creare l'ordine
      const { data: orphanedLocks } = await supabase
        .from('seat_locks')
        .select('event_seat_id')
        .lt('expires_at', now);

      if (orphanedLocks && orphanedLocks.length > 0) {
        const orphanedSeatIds = orphanedLocks.map(l => l.event_seat_id);
        
        await supabase
          .from('event_seats')
          .update({ status: 'available', lock_expires_at: null })
          .in('id', orphanedSeatIds);
          
        await supabase.from('seat_locks').delete().in('event_seat_id', orphanedSeatIds);
      }

      // FASE C: Pulizia classica di sicurezza
      await supabase
        .from('event_seats')
        .update({ status: 'available', lock_expires_at: null })
        .eq('event_id', eventForCleanup.id)
        .eq('status', 'booked')
        .lt('lock_expires_at', now);

    } catch (cleanupError) {
      // Se c'è un errore nella pulizia, lo loggiamo ma NON blocchiamo il sito
      console.error("Errore durante la pulizia dei posti:", cleanupError);
    }
  }
  // --------------------------------------------------------

  // Fetch dell'evento (Il tuo codice originale)
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!event) return <div>Evento non trovato</div>;

  // Fetch dei posti aggiornati
  const { data: seats } = await supabase
    .from('event_seats')
    .select('id,status,price_cents,venue_seats(section_code,row_label,seat_number,seat_label,x_coord,y_coord,seat_radius,physical_block)')
    .eq('event_id', event.id)
    .order('created_at', { ascending: true });

  return <BookingClient event={event} seats={seats || []} />;
}