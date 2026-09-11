-- Phase 7 step 6 (settings): data only. Rows the admin screens edit and the
-- storefront reads with fallbacks are inserted if missing; existing values
-- are never touched (the seed writes the same rows).
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES
  ('invoice.footer', '""'::jsonb, CURRENT_TIMESTAMP),
  ('analytics.ga4Id', '""'::jsonb, CURRENT_TIMESTAMP),
  ('analytics.metaPixelId', '""'::jsonb, CURRENT_TIMESTAMP),
  ('analytics.tiktokPixelId', '""'::jsonb, CURRENT_TIMESTAMP),
  ('seo.defaults', '{"titleTemplate":"%s | Nasmeh.si","description":"","indexable":true}'::jsonb, CURRENT_TIMESTAMP),
  ('consent.version', '1'::jsonb, CURRENT_TIMESTAMP),
  ('consent.cookies', '[
    {"name":"nasmeh_consent","provider":"Nasmeh.si","purpose":"Shranjuje vašo izbiro zasebnosti (privolitev).","duration":"12 mesecev","category":"necessary"},
    {"name":"authjs.session-token","provider":"Nasmeh.si","purpose":"Prijavljena seja (račun, skrbništvo).","duration":"30 dni","category":"necessary"},
    {"name":"authjs.csrf-token","provider":"Nasmeh.si","purpose":"Zaščita obrazcev pred CSRF napadi.","duration":"seja","category":"necessary"},
    {"name":"nasmeh_maintenance","provider":"Nasmeh.si","purpose":"Dostop med vzdrževalnimi deli (če je aktivno).","duration":"24 ure","category":"necessary"},
    {"name":"_ga, _ga_*","provider":"Google Analytics","purpose":"Anonimna statistika obiskov (samo ob privolitvi analitičnih).","duration":"2 leti","category":"analytics"},
    {"name":"_fbp","provider":"Meta","purpose":"Meritev učinka oglasov (samo ob privolitvi trženjskih).","duration":"3 meseci","category":"marketing"}
  ]'::jsonb, CURRENT_TIMESTAMP),
  ('consent.banner', '{"title":"","body":""}'::jsonb, CURRENT_TIMESTAMP),
  ('legal.links', '{"terms":"/pogoji-poslovanja","privacy":"/politika-zasebnosti","cookies":"/politika-piskotkov","withdrawal":"/odstop-od-pogodbe","complaints":"/reklamacije"}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
