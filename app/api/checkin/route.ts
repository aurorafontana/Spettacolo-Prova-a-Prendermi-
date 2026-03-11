import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ticketCode, checkedInBy = 'admin' } = body;
  if (!ticketCode) return NextResponse.json({ ok: false, error: 'Missing ticketCode' }, { status: 400 });

  const supabase = getSupabaseServiceClient();
  const { data: item, error } = await supabase
    .from('order_items')
    .select('id, status, event_seat_id')
    .eq('ticket_code', ticketCode)
    .single();

  if (error || !item) return NextResponse.json({ ok: false, error: 'Ticket not found' }, { status: 404 });
  if (item.status === 'used') return NextResponse.json({ ok: false, error: 'Ticket already used' }, { status: 409 });

  await supabase.from('order_items').update({ status: 'used', checked_in_at: new Date().toISOString() }).eq('id', item.id);
  await supabase.from('event_seats').update({ status: 'checked_in' }).eq('id', item.event_seat_id);
  await supabase.from('checkin_logs').insert({ order_item_id: item.id, checked_in_by: checkedInBy, method: 'qr' });

  return NextResponse.json({ ok: true, message: 'Check-in completed' });
}
