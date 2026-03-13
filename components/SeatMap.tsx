'use client';

import { useEffect, useState } from 'react';

export default function SeatMap({ seats, selected, onToggle }: any) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  function toggle(id: string, status: string) {
    if (status !== 'available') return;
    onToggle((prev: string[]) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function getSeatFill(seat: any, isSelected: boolean) {
    if (seat.status === 'sold') return '#d9534f';
    if (seat.status === 'locked') return '#f0ad4e';
    if (isSelected) return '#0275d8';
    return '#5cb85c';
  }

  // --- LOGICA PLATEA ---
  function getGridColumn(r: number, s: number) {
    if (r >= 1 && r <= 6) {
      if (s >= 1 && s <= 16) return s + 3;
    }
    if (r >= 7 && r <= 10) {
      if (s >= 1 && s <= 9) return s + 1;
      if (s >= 10 && s <= 18) {
        if (r <= 8 && s > 16) return null;
        return s + 3;
      }
    }
    if (r >= 11 && r <= 14) {
      if (s >= 1 && s <= 10) return s;
      if (s >= 11 && s <= 20) return s + 2;
    }
    if (r === 15) {
      if (s >= 1 && s <= 8) return s + 2;
      if (s >= 9 && s <= 18) return s + 4;
    }
    if (r === 16 || r === 17) {
      if (s >= 1 && s <= 4) return s + 2;
      if (s >= 5 && s <= 6) return s + 4;
      if (s >= 7 && s <= 8) return s + 6;
      if (s >= 9 && s <= 14) return s + 8;
    }
    return null;
  }

  function getPlateaSeatPosition(rowLabel: string, seatNumber: number) {
    const rowNumber = Number(rowLabel);
    if (isNaN(rowNumber) || rowNumber < 1 || rowNumber > 17) return null;
    const colIndex = getGridColumn(rowNumber, seatNumber);
    if (!colIndex) return null;

    const centerX = 600;
    const startY = 170;
    const rowGap = 42;
    const seatGap = 36;
    const radius = 14;

    let y = startY + (rowNumber - 1) * rowGap;
    if (rowNumber >= 7) y += 55;
    if (rowNumber >= 15) y += 55;

    const x = centerX + (colIndex - 11.5) * seatGap;
    return { x, y, r: radius, shape: 'circle' };
  }

  // --- LOGICA GALLERIA ---
  function getGalleriaGridColumn(r: string, s: number) {
    const row = r.toUpperCase();
    if (row === 'A' || row === 'B' || row === '1' || row === '2') {
      if (s >= 1 && s <= 16) return s + 3;
    }
    if (row === 'C' || row === 'D' || row === '3' || row === '4') {
      if (s >= 1 && s <= 4) return s + 2;
      if (s >= 5 && s <= 10) return s + 4;
      if (s >= 11 && s <= 14) return s + 6;
    }
    return null;
  }

  function getGalleriaSeatPosition(rowLabel: string, seatNumber: number, meta: any) {
    const row = String(rowLabel).toUpperCase();
    let rowIndex = -1;

    if (row === 'A' || row === '1') rowIndex = 0;
    else if (row === 'B' || row === '2') rowIndex = 1;
    else if (row === 'C' || row === '3') rowIndex = 2;
    else if (row === 'D' || row === '4') rowIndex = 3;

    const colIndex = getGalleriaGridColumn(row, seatNumber);

    if (rowIndex !== -1 && colIndex) {
      const centerX = 600;
      const seatGap = 36;
      const rowGap = 42;
      const startY = 1080;
      const x = centerX + (colIndex - 11.5) * seatGap;
      const y = startY + rowIndex * rowGap;
      return { x, y, r: 13, shape: 'circle' };
    }

    const x = Number(meta.x_coord || 0);
    const y = Number(meta.y_coord || 0);
    return { x: x + 40, y: y + 800, r: 13, shape: 'circle' };
  }

  // --- LOGICA POSTI SPECIALI (Box e Casettine) ---
  function getSpecialSeatPosition(label: string) {
    switch (label) {
      case 'BOX_DISABILI':
        return { x: 990, y: 460, w: 75, h: 75, shape: 'rect', lines: ['BOX', 'DISABILI'] };
      case 'CASETTA_DX':
        return { x: 1080, y: 550, w: 80, h: 250, shape: 'rect', lines: ['CASETTA', 'DX'] };
      case 'CASETTA_SX_1':
        return { x: 40, y: 300, w: 80, h: 220, shape: 'rect', lines: ['CASETTA', 'SX 1'] };
      case 'CASETTA_SX_2':
        return { x: 40, y: 550, w: 80, h: 220, shape: 'rect', lines: ['CASETTA', 'SX 2'] };
      default:
        return null;
    }
  }

  function getVisualSeat(seat: any) {
    const meta = seat.venue_seats || {};
    const section = String(meta.section_code || '').toUpperCase();
    const rowLabel = String(meta.row_label || '');
    const seatNumber = Number(meta.seat_number || 0);
    const label = String(meta.seat_label || '').toUpperCase();

    if (section === 'SPECIAL' || label.includes('CASETTA') || label.includes('BOX')) {
      return getSpecialSeatPosition(label);
    }
    if (section === 'PLATEA') {
      return getPlateaSeatPosition(rowLabel, seatNumber);
    }
    if (section === 'GALLERIA') {
      return getGalleriaSeatPosition(rowLabel, seatNumber, meta);
    }

    return {
      x: Number(meta.x_coord || 0),
      y: Number(meta.y_coord || 0),
      r: Number(meta.seat_radius || 12),
      shape: 'circle'
    };
  }

  // INIEZIONE POSTI VIRTUALI: Creiamo i 4 posti manualmente per farli apparire subito
  const virtualSeats = [
    { id: 'virtual_box', status: 'available', price_cents: 0, venue_seats: { section_code: 'SPECIAL', seat_label: 'BOX_DISABILI' } },
    { id: 'virtual_dx', status: 'available', price_cents: 6000, venue_seats: { section_code: 'SPECIAL', seat_label: 'CASETTA_DX' } },
    { id: 'virtual_sx1', status: 'available', price_cents: 6000, venue_seats: { section_code: 'SPECIAL', seat_label: 'CASETTA_SX_1' } },
    { id: 'virtual_sx2', status: 'available', price_cents: 6000, venue_seats: { section_code: 'SPECIAL', seat_label: 'CASETTA_SX_2' } }
  ];

  // Uniamo i posti veri (dal DB) con i nostri posti virtuali
  const allSeatsToRender = [...(seats || []), ...virtualSeats];

  const scale = isMobile ? 0.75 : 1;
  const svgWidth = 1200;
  const svgHeight = 1350;

  return (
    <div
      style={{
        border: '1px solid #d9d9d9',
        borderRadius: 16,
        padding: isMobile ? 12 : 24,
        overflowX: 'auto',
        overflowY: 'hidden',
        backgroundColor: '#f7f7f7',
      }}
    >
      <div
        style={{
          width: `${svgWidth * scale}px`,
          minWidth: `${svgWidth * scale}px`,
          height: `${svgHeight * scale}px`,
          margin: '0 auto',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${svgWidth}px`,
            height: `${svgHeight}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <svg width="1200" height="1350" viewBox="0 0 1200 1350" style={{ display: 'block' }}>
            {/* PALCO */}
            <g>
              <path d="M 340 20 L 860 20 L 860 75 L 878 98 L 878 115 L 858 92 L 342 92 L 322 115 L 322 98 L 340 75 Z" fill="#c9252d" />
              <text x="600" y="58" fontSize="28" fontWeight="800" textAnchor="middle" fill="#ffffff" style={{ letterSpacing: '1px', fontFamily: 'Arial, Helvetica, sans-serif' }}>
                PALCOSCENICO
              </text>
            </g>

            {/* TITOLI */}
            <text x="600" y="150" fontSize="22" fontWeight="800" textAnchor="middle" fill="#444" style={{ letterSpacing: '1px', textDecoration: 'underline', fontFamily: 'Arial, Helvetica, sans-serif' }}>PLATEA</text>
            <text x="600" y="445" fontSize="18" fontWeight="800" textAnchor="middle" fill="#7a7a7a" style={{ letterSpacing: '2px', fontFamily: 'Arial, Helvetica, sans-serif' }}>1° CORRIDOIO</text>
            <text x="600" y="835" fontSize="18" fontWeight="800" textAnchor="middle" fill="#7a7a7a" style={{ letterSpacing: '2px', fontFamily: 'Arial, Helvetica, sans-serif' }}>2° CORRIDOIO</text>
            <text x="600" y="1035" fontSize="22" fontWeight="800" textAnchor="middle" fill="#444" style={{ letterSpacing: '1px', textDecoration: 'underline', fontFamily: 'Arial, Helvetica, sans-serif' }}>GALLERIA</text>

            {/* RENDERING DI TUTTI I POSTI (Veri + Virtuali) */}
            {allSeatsToRender.map((seat: any) => {
              const meta = seat.venue_seats || {};
              const visual = getVisualSeat(seat);
              if (!visual) return null;

              const isSelected = selected.includes(seat.id);
              let fill = getSeatFill(seat, isSelected);

              // Evidenziazione speciale: Posto 16 Fila 8 per Accompagnatore
              const isAccompagnatore = 
                String(meta.section_code).toUpperCase() === 'PLATEA' && 
                String(meta.row_label) === '8' && 
                Number(meta.seat_number) === 16;
                
              if (isAccompagnatore && seat.status === 'available' && !isSelected) {
                fill = '#17a2b8'; // Azzurro Accompagnatore
              }

              return (
                <g
                  key={seat.id}
                  onClick={() => toggle(seat.id, seat.status)}
                  style={{
                    cursor: seat.status === 'available' ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s ease-in-out',
                  }}
                >
                  {visual.shape === 'rect' ? (
                    <>
                      <rect 
                        x={visual.x} 
                        y={visual.y} 
                        width={(visual as any).w} 
                        height={(visual as any).h} 
                        fill={fill} 
                        rx="12" 
                        stroke="#ffffff" 
                        strokeWidth="3" 
                      />
                      {(visual as any).lines.map((line: string, i: number) => (
                        <text 
                          key={i} 
                          x={visual.x + ((visual as any).w / 2)} 
                          y={visual.y + ((visual as any).h / 2) - (((visual as any).lines.length - 1) * 8) + (i * 18)} 
                          fontSize="13" 
                          fontWeight="800" 
                          fill="#ffffff" 
                          textAnchor="middle" 
                          dominantBaseline="middle" 
                          pointerEvents="none" 
                          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                        >
                          {line}
                        </text>
                      ))}
                    </>
                  ) : (
                    <>
                      <circle 
                        cx={visual.x} 
                        cy={visual.y} 
                        r={(visual as any).r} 
                        fill={fill} 
                        stroke="#ffffff" 
                        strokeWidth="2" 
                      />
                      <text 
                        x={visual.x} 
                        y={visual.y} 
                        fontSize={isAccompagnatore ? "10" : "11"} 
                        fontWeight="700" 
                        fill="#ffffff" 
                        textAnchor="middle" 
                        dominantBaseline="middle" 
                        pointerEvents="none" 
                        style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                      >
                        {isAccompagnatore ? "ACC." : meta.seat_number}
                      </text>
                    </>
                  )}
                  <title>{isAccompagnatore ? "Posto Accompagnatore" : meta.seat_label} - {seat.status}</title>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}