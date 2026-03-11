# Teatro Carbonia – Fase 5 (Supabase reale)

Questa fase collega la web app alla persistenza reale con Supabase e prepara il flusso per Stripe + QR code.

## Cosa include
- client Supabase lato server e client
- schema SQL PostgreSQL / Supabase
- funzioni SQL per lock posti e rilascio lock scaduti
- API route Next.js per lock, checkout, check-in e webhook Stripe
- seed evento demo
- componenti base per pagina evento e mappa posti
- generazione payload QR per singolo biglietto

## Stack
- Next.js App Router
- Supabase Postgres
- Stripe Checkout
- QR code payload per biglietti

## Setup
1. Crea progetto Supabase
2. Esegui `supabase_schema_phase5.sql`
3. Esegui `supabase_seed_phase5.sql`
4. Configura `.env.local` usando `env.example`
5. `npm install`
6. `npm run dev`

## Variabili ambiente
Vedi `env.example`

## Stato attuale
- pronto per persistenza reale su Supabase
- webhook Stripe predisposto
- QR payload generato lato backend
- da completare in live:
  - chiavi reali Stripe
  - email invio biglietti
  - scanner QR frontend admin
  - eventuali policy RLS finali
