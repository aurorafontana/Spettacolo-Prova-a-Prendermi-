insert into venue_sections (code, name, sort_order)
values
  ('PALCO', 'Palco', 1),
  ('PLATEA', 'Platea', 2),
  ('GALLERIA', 'Galleria', 3)
on conflict (code) do nothing;

insert into events (slug, title, description, event_start)
values (
  'evento-demo-teatro-carbonia',
  'Evento Demo – Teatro di Carbonia',
  'Evento dimostrativo per test prenotazione posti',
  now() + interval '15 days'
)
on conflict (slug) do nothing;
