import BookingClient from '@/components/BookingClient';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: event } = await supabase.from('events').select('*').eq('slug', slug).single();
  if (!event) return <div>Evento non trovato</div>;

  const { data: seats } = await supabase
    .from('event_seats')
    .select('id,status,price_cents,venue_seats(section_code,row_label,seat_number,seat_label,x_coord,y_coord,seat_radius,physical_block)')
    .eq('event_id', event.id)
    .order('created_at', { ascending: true });

  return <BookingClient event={event} seats={seats || []} />;
}
