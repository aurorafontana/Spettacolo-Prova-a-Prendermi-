'use client';

import { useMemo, useState } from 'react';
import SeatMap from './SeatMap';

export default function BookingClient({ event, seats }: any) {
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [lockCompleted, setLockCompleted] = useState(false);

  const [customer, setCustomer] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  const total = useMemo(
    () =>
      seats
        .filter((s: any) => selected.includes(s.id))
        .reduce((sum: number, s: any) => sum + s.price_cents, 0),
    [selected, seats]
  );

  const selectedSeats = useMemo(
    () => seats.filter((s: any) => selected.includes(s.id)),
    [selected, seats]
  );

  function updateCustomer(field: string, value: string) {
    setCustomer((prev) => ({ ...prev, [field]: value }));
  }

  function startBooking() {
    if (!selected.length) {
      alert('Seleziona almeno un posto.');
      return;
    }
    setShowCustomerForm(true);
  }

  async function confirmCustomerAndLockSeats() {
    if (!customer.firstName.trim()) {
      alert('Inserisci il nome.');
      return;
    }

    if (!customer.lastName.trim()) {
      alert('Inserisci il cognome.');
      return;
    }

    if (!customer.email.trim()) {
      alert('Inserisci l’email.');
      return;
    }

    const sessionToken = crypto.randomUUID();
    setLoading(true);

    try {
      const lockRes = await fetch('/api/lock-seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, eventSeatIds: selected, sessionToken }),
      });

      const lockJson = await lockRes.json();

      if (!lockJson.ok) {
        throw new Error(lockJson.result?.message || lockJson.error || 'Errore nel blocco posti');
      }

      setLockCompleted(true);
      alert('Dati salvati e posti bloccati correttamente. Il prossimo step sarà il pagamento.');
    } catch (err: any) {
      alert(err.message || 'Errore durante il blocco dei posti');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, padding: 24 }}>
      <div>
        <h1>{event.title}</h1>
        <SeatMap seats={seats} selected={selected} onToggle={setSelected} />
      </div>

      <aside
        style={{
          border: '1px solid #ddd',
          borderRadius: 12,
          padding: 16,
          height: 'fit-content',
          background: '#fff',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Riepilogo</h3>

        <div style={{ marginBottom: 8 }}>
          <strong>Posti selezionati:</strong> {selected.length}
        </div>

        <div style={{ marginBottom: 12 }}>
          <strong>Totale:</strong> € {(total / 100).toFixed(2)}
        </div>

        {selectedSeats.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <strong>Posti scelti:</strong>
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {selectedSeats.map((seat: any) => (
                <li key={seat.id}>
                  {seat.venue_seats?.seat_label || `${seat.venue_seats?.row_label}-${seat.venue_seats?.seat_number}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!showCustomerForm && (
          <>
            <button
              onClick={startBooking}
              disabled={!selected.length}
              style={{
                marginTop: 8,
                width: '100%',
                padding: '12px 14px',
                borderRadius: 8,
                border: 'none',
                background: '#1d4ed8',
                color: '#fff',
                fontWeight: 700,
                cursor: selected.length ? 'pointer' : 'not-allowed',
              }}
            >
              Acquista
            </button>

            <div style={{ marginTop: 16 }}>
              <img
                src="/locandina.jpg"
                alt="Locandina evento"
                style={{
                  width: '100%',
                  borderRadius: 12,
                  display: 'block',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                }}
              />
            </div>
          </>
        )}

        {showCustomerForm && (
          <div style={{ marginTop: 20 }}>
            <h4 style={{ marginBottom: 12 }}>Dati intestatario ordine</h4>

            <div style={{ display: 'grid', gap: 10 }}>
              <input
                type="text"
                placeholder="Nome *"
                value={customer.firstName}
                onChange={(e) => updateCustomer('firstName', e.target.value)}
                style={inputStyle}
              />

              <input
                type="text"
                placeholder="Cognome *"
                value={customer.lastName}
                onChange={(e) => updateCustomer('lastName', e.target.value)}
                style={inputStyle}
              />

              <input
                type="email"
                placeholder="Email *"
                value={customer.email}
                onChange={(e) => updateCustomer('email', e.target.value)}
                style={inputStyle}
              />

              <input
                type="text"
                placeholder="Telefono (facoltativo)"
                value={customer.phone}
                onChange={(e) => updateCustomer('phone', e.target.value)}
                style={inputStyle}
              />
            </div>

            <button
              onClick={confirmCustomerAndLockSeats}
              disabled={loading}
              style={{
                marginTop: 16,
                width: '100%',
                padding: '12px 14px',
                borderRadius: 8,
                border: 'none',
                background: '#15803d',
                color: '#fff',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Attendere...' : 'Conferma dati e blocca posti'}
            </button>

            <button
              onClick={() => setShowCustomerForm(false)}
              disabled={loading}
              style={{
                marginTop: 10,
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #ccc',
                background: '#fff',
                color: '#333',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Torna indietro
            </button>

            {lockCompleted && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 8,
                  background: '#ecfdf5',
                  border: '1px solid #86efac',
                  color: '#166534',
                  fontSize: 14,
                  lineHeight: 1.4,
                }}
              >
                Posti bloccati correttamente.
                Il prossimo step sarà il pagamento.
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <img
                src="/locandina.jpg"
                alt="Locandina evento"
                style={{
                  width: '100%',
                  borderRadius: 12,
                  display: 'block',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                }}
              />
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #ccc',
  fontSize: 14,
  boxSizing: 'border-box',
};