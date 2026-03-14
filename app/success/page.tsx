export default function SuccessPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', textAlign: 'center', backgroundColor: '#f9fafb' }}>
      <div style={{ background: '#ffffff', padding: '40px', borderRadius: '16px', border: '1px solid #10b981', maxWidth: '500px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
        <h1 style={{ fontSize: '32px', margin: '0 0 16px 0', color: '#047857' }}>
          🎉 Pagamento Riuscito!
        </h1>
        
        <p style={{ fontSize: '18px', color: '#065f46', lineHeight: '1.5', marginBottom: '24px' }}>
          I tuoi posti sono stati bloccati e confermati con successo.
        </p>
        
        <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '15px', marginBottom: '24px' }}>
          <p style={{ margin: 0, fontSize: '16px', color: '#065f46', fontWeight: 'bold' }}>
            I biglietti saranno inviati via email.
          </p>
        </div>
        
        {/* Messaggio finale di sicurezza */}
        <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
          <p style={{ margin: 0, fontSize: '16px', color: '#059669', fontWeight: 'bold' }}>
            ✓ Ora puoi chiudere questa pagina in modo sicuro.
          </p>
        </div>
        
      </div>
    </div>
  );
}