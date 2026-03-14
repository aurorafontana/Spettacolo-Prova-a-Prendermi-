'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import SeatMap from './SeatMap';

type SeatType = 'adulto' | 'ridotto';

export default function BookingClient({ event, seats }: any) {
  const [selected, setSelected] = useState<string[]>([]);
  const [seatTypes, setSeatTypes] = useState<Record<string, SeatType>>({});
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

  const allSeats = useMemo(() => seats || [], [seats]);

  const selectedSeats = useMemo(
    () => allSeats.filter((s: any) => selected.includes(s.id)),
    [selected, allSeats]
  );

  useEffect(() => {
    setSeatTypes((prev) => {
      const updated: Record<string, SeatType> = {};
      for (const seatId of selected) {
        updated[seatId] = prev[seatId] || 'adulto';
      }
      return updated;
    });
  }, [selected]);

  const bookingFeePerSeatCents = 100;
  const adultPriceCents = 1500;
  const reducedPriceCents = 1000;

  // NUOVE FUNZIONI CHE LEGGONO IL NOME E NON L'ID
  function isSpecialSeat(seat: any) {
    const section = seat?.venue_seats?.section_code;
    return section === 'SPECIAL' || section === 'CASETTA' || section === 'BOX';
  }

  function getSeatBasePrice(seat: any) {
    const label = seat?.venue_seats?.seat_label || '';
    if (label === 'BOX DISABILI') return 1500;
    if (label.includes('CASETTA')) return 6000;
    
    const type = seatTypes[seat.id] || 'adulto';
    return type === 'adulto' ? adultPriceCents : reducedPriceCents;
  }

  function getSeatBookingFee(seat: any) {
    const label = seat?.venue_seats?.seat_label || '';
    if (label === 'BOX DISABILI') return bookingFeePerSeatCents;
    if (label.includes('CASETTA')) return 0;
    
    return bookingFeePerSeatCents;
  }

  function getSeatFinalPrice(seat: any) {
    return getSeatBasePrice(seat) + getSeatBookingFee(seat);
  }

  const ticketTotal = useMemo(() => {
    return selectedSeats.reduce((sum: number, seat: any) => sum + getSeatBasePrice(seat), 0);
  }, [selectedSeats, seatTypes]);

  const bookingFeeTotal = useMemo(() => {
    return selectedSeats.reduce((sum: number, seat: any) => sum + getSeatBookingFee(seat), 0);
  }, [selectedSeats]);

  const finalTotal = useMemo(() => {
    return ticketTotal + bookingFeeTotal;
  }, [ticketTotal, bookingFeeTotal]);

  function updateCustomer(field: string, value: string) {
    setCustomer((prev) => ({ ...prev, [field]: value }));
  }

  function updateSeatType(seatId: string, type: SeatType) {
    setSeatTypes((prev) => ({
      ...prev,
      [seatId]: type,
    }));
  }

  function getSeatLabel(seat: any) {
    return (
      seat.venue_seats?.seat_label ||
      `${seat.venue_seats?.row_label}-${seat.venue_seats?.seat_number}`
    );
  }

  function startBooking() {
    if (!selected.length) {
      alert('Seleziona almeno un posto.');
      return;
    }

    for (const seat of selectedSeats) {
      if (!isSpecialSeat(seat) && !seatTypes[seat.id]) {
        alert('Seleziona la tipologia per tutti i posti.');
        return;
      }
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

    for (const seat of selectedSeats) {
      if (!isSpecialSeat(seat) && !seatTypes[seat.id]) {
        alert('Seleziona la tipologia per tutti i posti.');
        return;
      }
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
          seatDetails: selectedSeats.map((seat: any) => ({
            eventSeatId: seat.id,
            ticketType: isSpecialSeat(seat) ? 'stanza_privata' : seatTypes[seat.id],
            basePriceCents: getSeatBasePrice(seat),
            bookingFeeCents: getSeatBookingFee(seat),
            finalPriceCents: getSeatFinalPrice(seat),
          })),
          customer,
        }),
      });

      const lockJson = await lockRes.json();

      if (!lockJson.ok) {
        throw new Error(
          lockJson.result?.message || lockJson.error || 'Errore nel blocco posti'
        );
      }

      setLockCompleted(true);
      
      const checkoutRes = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          sessionToken: sessionToken,
          customer: customer,
          seatDetails: selectedSeats.map((seat: any) => ({
            eventSeatId: seat.id,
            ticketType: isSpecialSeat(seat) ? 'stanza_privata' : seatTypes[seat.id],
            basePriceCents: getSeatBasePrice(seat),
            bookingFeeCents: getSeatBookingFee(seat),
            finalPriceCents: getSeatFinalPrice(seat),
            seatName: getSeatLabel(seat)
          }))
        }),
      });

      const checkoutJson = await checkoutRes.json();

      if (!checkoutRes.ok || !checkoutJson.url) {
        throw new Error(checkoutJson.error || 'Errore nella creazione della pagina di pagamento Stripe');
      }

      window.location.href = checkoutJson.url;

    } catch (err: any) {
      alert(err.message || 'Errore durante il blocco dei posti');
    } finally {
      setLoading(false);
    }
  }

  const mapScale = isMobile ? 1 : 1;

  return (
    <div style={pageWrapperStyle}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={titleStyle}>{event.title}</h1>
        {event.description && (
          <p style={descriptionStyle}>
            {event.description}
          </p>
        )}
      </div>

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
              overflowX: isMobile ? 'auto' : 'auto',
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
            {/* === LEGENDA === */}
            <div style={{ marginBottom: 24, padding: 16, background: '#fff', border: '1px solid #d8d8d8', borderRadius: 12 }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#333', fontFamily: 'Arial, Helvetica, sans-serif' }}>
                Legenda Posti
              </h4>
              
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#5cb85c', flexShrink: 0 }} />
                  <div style={{ fontSize: 14, color: '#555', fontFamily: 'Arial, Helvetica, sans-serif' }}>Libero</div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#0275d8', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                    <div style={{ fontSize: 14, color: '#555', lineHeight: 1.2 }}>Prenotazione</div>
                    <div style={{ fontSize: 12, color: '#777', lineHeight: 1.2 }}>in attesa del pagamento</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#F0AD4E', flexShrink: 0 }} />
                  <div style={{ fontSize: 14, color: '#555', fontFamily: 'Arial, Helvetica, sans-serif' }}>Acquistato / Non disponibile</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#17a2b8', flexShrink: 0 }} />
                  <div style={{ fontSize: 14, color: '#555', fontFamily: 'Arial, Helvetica, sans-serif' }}>Riservato accomp. box disabile</div>
                </div>
              </div>
            </div>

            <h3 style={summaryTitleStyle}>Riepilogo</h3>

            <div style={{ marginBottom: 8 }}>
              <strong>Posti selezionati:</strong> {selected.length}
            </div>

            {selectedSeats.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <strong>Dettaglio posti:</strong>

                <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                  {selectedSeats.map((seat: any) => {
                    const seatId = seat.id;
                    const special = isSpecialSeat(seat);
                    const seatType = seatTypes[seatId] || 'adulto';
                    const isBox = seat.venue_seats?.seat_label?.includes('BOX');

                    return (
                      <div key={seatId} style={seatRowCardStyle}>
                        <div style={{ marginBottom: 8, fontWeight: 700 }}>
                          {getSeatLabel(seat)}
                        </div>

                        {special ? (
                          <div style={{ fontSize: 14, color: '#555', marginBottom: 8, padding: '4px 0' }}>
                            <em>
                              {isBox
                                ? 'Posto riservato (€15 + €1 prevendita)'
                                : 'Stanza privata (Prezzo fisso)'}
                            </em>
                          </div>
                        ) : (
                          <div style={radioRowStyle}>
                            <label style={radioLabelStyle}>
                              <input
                                type="radio"
                                name={`ticket-type-${seatId}`}
                                checked={seatType === 'adulto'}
                                onChange={() => updateSeatType(seatId, 'adulto')}
                              />
                              <span>Adulto (€15 + €1 prevendita)</span>
                            </label>

                            <label style={radioLabelStyle}>
                              <input
                                type="radio"
                                name={`ticket-type-${seatId}`}
                                checked={seatType === 'ridotto'}
                                onChange={() => updateSeatType(seatId, 'ridotto')}
                              />
                              <span>Ridotto under 13 (€10 + €1 prevendita)</span>
                            </label>
                          </div>
                        )}

                        <div style={{ marginTop: 8, fontSize: 14, color: '#333' }}>
                          Totale posto: <strong>€ {(getSeatFinalPrice(seat) / 100).toFixed(2)}</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <strong>Biglietti:</strong> € {(ticketTotal / 100).toFixed(2)}
            </div>

            <div style={{ marginBottom: 8 }}>
              <strong>Prevendita:</strong> € {(bookingFeeTotal / 100).toFixed(2)}
            </div>

            <div style={{ marginBottom: 14, fontSize: 18 }}>
              <strong>Totale finale:</strong> € {(finalTotal / 100).toFixed(2)}
            </div>

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
                  {loading ? 'Attendere...' : 'Conferma dati e vai alla cassa'}
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
                    Reindirizzamento a Stripe in corso...
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

const pageWrapperStyle: CSSProperties = { width: '100%', padding: '16px 12px', boxSizing: 'border-box' };
const titleStyle: CSSProperties = { margin: '0 0 16px 0', lineHeight: 1.15, wordBreak: 'break-word' };
const layoutStyle: CSSProperties = { display: 'grid', gap: 18, alignItems: 'start', width: '100%' };
const sharedCardStyle: CSSProperties = { background: '#f3f3f3', border: '1px solid #d8d8d8', borderRadius: 18, boxSizing: 'border-box' };
const mainCardStyle: CSSProperties = { ...sharedCardStyle, padding: 16, minWidth: 0, overflow: 'hidden' };
const sideCardStyle: CSSProperties = { ...sharedCardStyle, padding: 16, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 18 };
const seatMapWrapperStyle: CSSProperties = { width: '100%', height: 'fit-content', minHeight: 0, overflow: 'visible', WebkitOverflowScrolling: 'touch', boxSizing: 'border-box' };
const summaryTitleStyle: CSSProperties = { marginTop: 0, marginBottom: 14 };
const seatRowCardStyle: CSSProperties = { border: '1px solid #d8d8d8', borderRadius: 12, padding: 12, background: '#fff' };
const radioRowStyle: CSSProperties = { display: 'grid', gap: 8 };
const radioLabelStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 };
const primaryButtonStyle: CSSProperties = { marginTop: 8, width: '100%', padding: '12px 14px', borderRadius: 10, border: 'none', background: '#5f7eea', color: '#fff', fontWeight: 700, fontSize: 16 };
const confirmButtonStyle: CSSProperties = { marginTop: 16, width: '100%', padding: '12px 14px', borderRadius: 10, border: 'none', background: '#15803d', color: '#fff', fontWeight: 700, fontSize: 16 };
const secondaryButtonStyle: CSSProperties = { marginTop: 10, width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cfcfcf', background: '#fff', color: '#333', fontWeight: 600, fontSize: 15 };
const successBoxStyle: CSSProperties = { marginTop: 16, padding: 12, borderRadius: 10, background: '#ecfdf5', border: '1px solid #86efac', color: '#166534', fontSize: 14, lineHeight: 1.4 };
const posterWrapperStyle: CSSProperties = { width: '100%', display: 'flex', alignItems: 'flex-end' };
const posterStyle: CSSProperties = { width: '100%', height: 'auto', display: 'block', borderRadius: 14, objectFit: 'cover', border: '1px solid #d8d8d8' };
const inputStyle: CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ccc', fontSize: 14, boxSizing: 'border-box' };
const descriptionStyle: CSSProperties = { margin: 0, fontSize: 16, lineHeight: 1.6, color: '#4a4a4a', fontWeight: 400, textAlign: 'justify' };