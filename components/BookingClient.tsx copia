'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import SeatMap from './SeatMap';

export default function BookingClient({ event, seats }: any) {
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [lockCompleted, setLockCompleted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [customer, setCustomer] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 768);
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        body: JSON.stringify({
          eventId: event.id,
          eventSeatIds: selected,
          sessionToken,
        }),
      });

      const lockJson = await lockRes.json();

      if (!lockJson.ok) {
        throw new Error(
          lockJson.result?.message || lockJson.error || 'Errore nel blocco posti'
        );
      }

      setLockCompleted(true);
      alert('Dati salvati e posti bloccati correttamente. Il prossimo step sarà il pagamento.');
    } catch (err: any) {
      alert(err.message || 'Errore durante il blocco dei posti');
    } finally {
      setLoading(false);
    }
  }

  const mapScale = isMobile ? 0.7 : 1;

  return (
    <div style={pageWrapperStyle}>
      <h1 style={titleStyle}>{event.title}</h1>

      <div
        style={{
          ...layoutStyle,
          gridTemplateColumns: isMobile
            ? '1fr'
            : 'minmax(0, 3.6fr) minmax(320px, 1fr)',
        }}
      >
        <section style={mainCardStyle}>
          <div
            style={{
              ...seatMapWrapperStyle,
              overflowX: isMobile ? 'hidden' : 'auto',
              overflowY: 'hidden',
            }}
          >
            <div
              style={{
                transform: `scale(${mapScale})`,
                transformOrigin: 'top left',
                width: isMobile ? `${100 / mapScale}%` : '100%',
                display: 'inline-block',
              }}
            >
              <SeatMap seats={seats} selected={selected} onToggle={setSelected} />
            </div>
          </div>
        </section>

        <aside style={sideCardStyle}>
          <div>
            <h3 style={summaryTitleStyle}>Riepilogo</h3>

            <div style={{ marginBottom: 8 }}>
              <strong>Posti selezionati:</strong> {selected.length}
            </div>

            <div style={{ marginBottom: 12 }}>
              <strong>Totale:</strong> € {(total / 100).toFixed(2)}
            </div>

            {selectedSeats.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <strong>Posti scelti:</strong>
                <ul style={selectedListStyle}>
                  {selectedSeats.map((seat: any) => (
                    <li key={seat.id} style={{ marginBottom: 4 }}>
                      {seat.venue_seats?.seat_label ||
                        `${seat.venue_seats?.row_label}-${seat.venue_seats?.seat_number}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!showCustomerForm && (
              <button
                onClick={startBooking}
                disabled={!selected.length}
                style={{
                  ...primaryButtonStyle,
                  cursor: selected.length ? 'pointer' : 'not-allowed',
                  opacity: selected.length ? 1 : 0.72,
                }}
              >
                Acquista
              </button>
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
                    ...confirmButtonStyle,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.8 : 1,
                  }}
                >
                  {loading ? 'Attendere...' : 'Conferma dati e blocca posti'}
                </button>

                <button
                  onClick={() => setShowCustomerForm(false)}
                  disabled={loading}
                  style={{
                    ...secondaryButtonStyle,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.8 : 1,
                  }}
                >
                  Torna indietro
                </button>

                {lockCompleted && (
                  <div style={successBoxStyle}>
                    Posti bloccati correttamente.
                    <br />
                    Il prossimo step sarà il pagamento.
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={posterWrapperStyle}>
            <img
              src="/locandina.jpg"
              alt="Locandina evento"
              style={posterStyle}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

const pageWrapperStyle: CSSProperties = {
  width: '100%',
  padding: '16px 12px',
  boxSizing: 'border-box',
};

const titleStyle: CSSProperties = {
  margin: '0 0 16px 0',
  lineHeight: 1.15,
  wordBreak: 'break-word',
};

const layoutStyle: CSSProperties = {
  display: 'grid',
  gap: 18,
  alignItems: 'start',
  width: '100%',
};

const sharedCardStyle: CSSProperties = {
  background: '#f3f3f3',
  border: '1px solid #d8d8d8',
  borderRadius: 18,
  boxSizing: 'border-box',
};

const mainCardStyle: CSSProperties = {
  ...sharedCardStyle,
  padding: 16,
  minWidth: 0,
  overflow: 'hidden',
};

const sideCardStyle: CSSProperties = {
  ...sharedCardStyle,
  padding: 16,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  gap: 18,
};

const seatMapWrapperStyle: CSSProperties = {
  width: '100%',
  height: 'fit-content',
  minHeight: 0,
  overflow: 'visible',
  WebkitOverflowScrolling: 'touch',
  boxSizing: 'border-box',
};

const summaryTitleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
};

const selectedListStyle: CSSProperties = {
  marginTop: 8,
  paddingLeft: 18,
  marginBottom: 0,
};

const primaryButtonStyle: CSSProperties = {
  marginTop: 8,
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: 'none',
  background: '#5f7eea',
  color: '#fff',
  fontWeight: 700,
  fontSize: 16,
};

const confirmButtonStyle: CSSProperties = {
  marginTop: 16,
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: 'none',
  background: '#15803d',
  color: '#fff',
  fontWeight: 700,
  fontSize: 16,
};

const secondaryButtonStyle: CSSProperties = {
  marginTop: 10,
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid #cfcfcf',
  background: '#fff',
  color: '#333',
  fontWeight: 600,
  fontSize: 15,
};

const successBoxStyle: CSSProperties = {
  marginTop: 16,
  padding: 12,
  borderRadius: 10,
  background: '#ecfdf5',
  border: '1px solid #86efac',
  color: '#166534',
  fontSize: 14,
  lineHeight: 1.4,
};

const posterWrapperStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'flex-end',
};

const posterStyle: CSSProperties = {
  width: '100%',
  height: 'auto',
  display: 'block',
  borderRadius: 14,
  objectFit: 'cover',
  border: '1px solid #d8d8d8',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #ccc',
  fontSize: 14,
  boxSizing: 'border-box',
};