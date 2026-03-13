export default function SuccessPage({
  searchParams,
}: {
  searchParams: { order?: string };
}) {
  const orderCode = searchParams?.order || 'Confermato';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', textAlign: 'center', backgroundColor: '#f9fafb' }}>
      <div style={{ background: '#ffffff', padding: '40px', borderRadius: '16px', border: '1px solid #10b981', maxWidth: '500px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
        <h1 style={{ fontSize: '32px', margin: '0 0 16px 0', color: '#047857' }}>
          🎉 Pagamento Riuscito!
        </h1>
        <p style={{ fontSize: '18px', color: '#065f46', lineHeight: '1.5' }}>
          I tuoi posti sono stati bloccati e confermati con successo. <br /><br />
          Codice Ordine: <strong style={{ background: '#ecfdf5', padding: '4px 8px', borderRadius: '4px' }}>{orderCode}</strong>
        </p>
        <p style={{ marginTop: '24px', fontSize: '15px', color: '#4b5563' }}>
          Mostra questo codice all'ingresso del teatro.
        </p>
        <div style={{ marginTop: '32px' }}>
          {/* LINK AGGIORNATO QUI SOTTO */}
          <a href="/events/prova-a-prendermi" style={{ padding: '12px 24px', backgroundColor: '#059669', color: 'white', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
            Torna allo Spettacolo
          </a>
        </div>
      </div>
    </div>
  );
}