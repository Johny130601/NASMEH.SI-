-- Phase 9 step 4 (GDPR and legal finalisation): data only. The cookie table
-- lists every cookie and storage key the app sets (lib/copy/cmp.ts COOKIES,
-- which the seed writes too). Third-party payment and bot-protection rows name
-- the provider, as the cookie policy §4 says; the Google Analytics row is not
-- called anonymous (its cookies hold a random browser identifier). The row is
-- replaced only while it still holds the exact default inserted by
-- 20260911120000_phase7_settings; a table edited
-- in the admin is never overwritten. jsonb equality ignores key order and
-- whitespace, so a seeded row with the same content matches as well.
UPDATE "Setting"
SET "value" = '[
    {"name":"nasmeh_consent","provider":"Nasmeh.si","purpose":"Shranjuje vašo izbiro piškotkov (kategorije, različico, čas in naključni identifikator, s katerim izbiro povežemo z dnevnikom privolitev).","duration":"12 mesecev","category":"necessary"},
    {"name":"__Secure-authjs.session-token","provider":"Nasmeh.si","purpose":"Prijavljena seja (račun, skrbništvo). Brez https (samo pri razvoju) se imenuje authjs.session-token.","duration":"30 dni (seja osebja velja 12 ur)","category":"necessary"},
    {"name":"__Host-authjs.csrf-token","provider":"Nasmeh.si","purpose":"Zaščita prijavnih končnih točk pred napadi CSRF; nastavi se le ob neposrednem obisku naslovov /api/auth. Brez https (samo pri razvoju) se imenuje authjs.csrf-token.","duration":"seja","category":"necessary"},
    {"name":"__Secure-authjs.callback-url","provider":"Nasmeh.si","purpose":"Stran, na katero vas preusmerimo po prijavi ali odjavi. Brez https (samo pri razvoju) se imenuje authjs.callback-url.","duration":"seja","category":"necessary"},
    {"name":"nasmeh_preauth","provider":"Nasmeh.si","purpose":"Samo za osebje: potrdilo o pravilnem geslu med dvostopenjsko prijavo.","duration":"5 minut","category":"necessary"},
    {"name":"nasmeh_cart","provider":"Nasmeh.si","purpose":"Košarica obiskovalca brez prijave (izdelki in količine, podpisano).","duration":"30 dni","category":"necessary"},
    {"name":"nasmeh_koda","provider":"Nasmeh.si","purpose":"Uveljavljena koda za popust.","duration":"30 dni","category":"necessary"},
    {"name":"nasmeh_order_*","provider":"Nasmeh.si","purpose":"Dostop do potrditve oddanega naročila v tem brskalniku (podpisano, en piškotek na naročilo).","duration":"30 dni","category":"necessary"},
    {"name":"nasmeh_maintenance","provider":"Nasmeh.si","purpose":"Dostop med vzdrževalnimi deli (če je aktivno).","duration":"24 ur","category":"necessary"},
    {"name":"nasmeh_welcome_seen","provider":"Nasmeh.si","purpose":"Zapis v shrambi seje brskalnika (sessionStorage), ne piškotek: pojavno okno dobrodošlice se v isti seji ne prikaže znova.","duration":"do zaprtja zavihka","category":"necessary"},
    {"name":"Stripe.js","provider":"Stripe","purpose":"Samo v koraku plačila prek ponudnika Stripe: izvedba plačila in preprečevanje zlorab. Imena in trajanje piškotkov določa Stripe.","duration":"določa ponudnik","category":"necessary"},
    {"name":"PayPal","provider":"PayPal","purpose":"Samo pri plačilu prek PayPala: plačilni gumbi in okno PayPal (izvedba in varnost plačila). Imena in trajanje piškotkov določa PayPal.","duration":"določa ponudnik","category":"necessary"},
    {"name":"Cloudflare Turnstile","provider":"Cloudflare","purpose":"Zaščita obrazcev pred roboti (e-novice v nogi strani, prijava in registracija, blagajna, kontakt, sledenje pošiljki in drugi obrazci). Morebitno shrambo določa Cloudflare.","duration":"določa ponudnik","category":"necessary"},
    {"name":"_ga, _ga_*","provider":"Google Analytics","purpose":"Statistika obiskov z naključnim identifikatorjem brskalnika (psevdonimni podatki; samo ob privolitvi analitičnih).","duration":"2 leti","category":"analytics"},
    {"name":"_fbp","provider":"Meta","purpose":"Meritev učinka oglasov (samo ob privolitvi trženjskih).","duration":"3 meseci","category":"marketing"}
  ]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'consent.cookies'
  AND "value" = '[
    {"name":"nasmeh_consent","provider":"Nasmeh.si","purpose":"Shranjuje vašo izbiro zasebnosti (privolitev).","duration":"12 mesecev","category":"necessary"},
    {"name":"authjs.session-token","provider":"Nasmeh.si","purpose":"Prijavljena seja (račun, skrbništvo).","duration":"30 dni","category":"necessary"},
    {"name":"authjs.csrf-token","provider":"Nasmeh.si","purpose":"Zaščita obrazcev pred CSRF napadi.","duration":"seja","category":"necessary"},
    {"name":"nasmeh_maintenance","provider":"Nasmeh.si","purpose":"Dostop med vzdrževalnimi deli (če je aktivno).","duration":"24 ure","category":"necessary"},
    {"name":"_ga, _ga_*","provider":"Google Analytics","purpose":"Anonimna statistika obiskov (samo ob privolitvi analitičnih).","duration":"2 leti","category":"analytics"},
    {"name":"_fbp","provider":"Meta","purpose":"Meritev učinka oglasov (samo ob privolitvi trženjskih).","duration":"3 meseci","category":"marketing"}
  ]'::jsonb;
