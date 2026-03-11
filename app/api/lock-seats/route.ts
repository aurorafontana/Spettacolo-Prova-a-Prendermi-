import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { eventId, eventSeatIds, sessionToken } = body;

  if (!eventId || !Array.isArray(eventSeatIds) || eventSeatIds.length === 0 || !sessionToken) {
    return NextResponse.json({ ok: false, error: 'Missing data' }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('lock_event_seats', {
    p_event_id: eventId,
    p_event_seat_ids: eventSeatIds,
    p_session_token: sessionToken,
    p_lock_minutes: 10
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const result = Array.isArray(data) ? data[0] : null;
  return NextResponse.json({ ok: !!result?.success, result });
}
