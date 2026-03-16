import BookingClient from '@/components/BookingClient';
import { notFound } from 'next/navigation';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

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

  // --- 🧹 PULIZIA AUTOMATICA (LAZY CLEANUP) CORRETTA ---
  if (eventForCleanup) {
    try {
      // FASE A: Gestione degli Ordini Scaduti ('payment_pending' -> 'expired')
      const { data: expiredOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'payment_pending')
        .lt('expires_at', now);

      if (expiredOrders && expiredOrders.length > 0) {
        const expiredOrderIds = expiredOrders.map(o => o.id);

        const { data: locks } = await supabase
          .from('seat_locks')
          .select('event_seat_id')
          .in('order_id', expiredOrderIds);

        if (locks && locks.length > 0) {
          const seatIdsToFree = locks.map(l => l.event_seat_id);

          // CORREZIONE: Ora cerca 'locked' invece di 'booked'
          await supabase
            .from('event_seats')
            .update({ status: 'available', lock_expires_at: null })
            .in('id', seatIdsToFree)
            .eq('status', 'locked'); 
        }

        await supabase.from('seat_locks').delete().in('order_id', expiredOrderIds);
        await supabase.from('orders').update({ status: 'expired' }).in('id', expiredOrderIds);
      }

      // FASE B: Pulizia dei blocchi isolati
      const { data: orphanedLocks } = await supabase
        .from('seat_locks')
        .select('event_seat_id')
        .lt('expires_at', now);

      if (orphanedLocks && orphanedLocks.length > 0) {
        const orphanedSeatIds = orphanedLocks.map(l => l.event_seat_id);
        
        // CORREZIONE: Ora cerca 'locked' invece di 'booked'
        await supabase
          .from('event_seats')
          .update({ status: 'available', lock_expires_at: null })
          .in('id', orphanedSeatIds)
          .eq('status', 'locked');
          
        await supabase.from('seat_locks').delete().in('event_seat_id', orphanedSeatIds);
      }

      // FASE C: Pulizia classica
      // CORREZIONE: Ora cerca 'locked' invece di 'booked'
      await supabase
        .from('event_seats')
        .update({ status: 'available', lock_expires_at: null })
        .eq('event_id', eventForCleanup.id)
        .eq('status', 'locked')
        .lt('lock_expires_at', now);

    } catch (cleanupError) {
      console.error("Errore durante la pulizia dei posti:", cleanupError);
    }
  }
  // --------------------------------------------------------

  // Fetch dell'evento 
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