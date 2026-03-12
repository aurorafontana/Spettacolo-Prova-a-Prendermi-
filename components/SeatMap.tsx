'use client';

import { useEffect, useMemo, useState } from 'react';

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

  const seatBounds = useMemo(() => {
    if (!seats || !seats.length) {
      return {
        minX: 0,
        minY: 0,
        maxX: 1100,
        maxY: 700,
      };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    seats.forEach((seat: any) => {
      const meta = seat.venue_seats || {};
      const x = Number(meta.x_coord || 0);
      const y = Number(meta.y_coord || 0);
      const r = Number(meta.seat_radius || 10);

      minX = Math.min(minX, x - r);
      minY = Math.min(minY, y - r);
      maxX = Math.max(maxX, x + r);
      maxY = Math.max(maxY, y + r);
    });

    const paddingX = 40;
    const paddingTop = 70;
    const paddingBottom = 25;

    return {
      minX: Math.max(0, minX - paddingX),
      minY: Math.max(0, minY - paddingTop),
      maxX: maxX + paddingX,
      maxY: maxY + paddingBottom,
    };
  }, [seats]);

  const viewBoxX = seatBounds.minX;
  const viewBoxY = seatBounds.minY;
  const viewBoxWidth = Math.max(100, seatBounds.maxX - seatBounds.minX);
  const viewBoxHeight = Math.max(100, seatBounds.maxY - seatBounds.minY);

  const mobileScale = 0.7;
  const visualScale = isMobile ? mobileScale : 1;

  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: 12,
        padding: isMobile ? 10 : 16,
        overflowX: 'auto',
        overflowY: 'hidden',
        background: '#f7f7f7',
      }}
    >
      <div
        style={{
          width: isMobile ? `${100 / visualScale}%` : '100%',
          transform: isMobile ? `scale(${visualScale})` : 'none',
          transformOrigin: 'top left',
          marginBottom: isMobile ? `-${(1 - visualScale) * viewBoxHeight}px` : 0,
        }}
      >
        <svg
          width="100%"
          viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
          style={{
            display: 'block',
            height: 'auto',
          }}
          preserveAspectRatio="xMidYMin meet"
        >
          <text
            x={(viewBoxX + viewBoxWidth / 2)}
            y={viewBoxY + 28}
            fontSize="24"
            fontWeight="700"
            textAnchor="middle"
          >
            PALCO
          </text>

          {seats.map((seat: any) => {
            const meta = seat.venue_seats || {};
            const isSelected = selected.includes(seat.id);

            const fill =
              seat.status === 'sold'
                ? '#d9534f'
                : seat.status === 'locked'
                ? '#f0ad4e'
                : isSelected
                ? '#0275d8'
                : '#5cb85c';

            const x = Number(meta.x_coord || 0);
            const y = Number(meta.y_coord || 0);
            const r = Number(meta.seat_radius || 10);

            return (
              <g
                key={seat.id}
                onClick={() => toggle(seat.id, seat.status)}
                style={{
                  cursor: seat.status === 'available' ? 'pointer' : 'not-allowed',
                }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={fill}
                />
                <title>
                  {meta.seat_label} - € {(seat.price_cents / 100).toFixed(2)} - {seat.status}
                </title>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}