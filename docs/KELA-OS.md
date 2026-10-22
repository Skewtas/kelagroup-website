# KELA OS – affärssystem och adminpanel

KELA OS ligger bakom den befintliga webbplatsen på samma Cloudflare Pages-projekt:

| Adress | Vad |
|---|---|
| `kelagroup.se/os/` | Adminpanelen (inloggning krävs) |
| `kelagroup.se/offert/<länk>` | Kundens offert via säker personlig länk |
| `kelagroup.se/api/os/*` | Adminpanelens API (all behörighet kontrolleras här) |
| `kelagroup.se/api/offert/*` | Kundens åtgärder på en offert (visning, godkänn, avböj) |

Den publika webbplatsen är orörd, med två undantag: `robots.txt` stänger ute `/os/`, `/offert/` och `/api/`, och en ny `_headers`-fil sätter säkerhetsheaders **endast** för `/os/*`.

---

## 1. Analys av befintlig kodbas (steg 1)

| Fråga | Svar |
|---|---|
| Ramverk | Statisk HTML/CSS/JS utan byggsteg (26 sidor, "Pop Stilren"-designen i `assets/pop-v6.css`). |
| Routing | Filbaserad. Inga omskrivningar. Ingen `404.html` (Pages serverar då `index.html` för okända sökvägar). |
| Databas | Ingen tidigare. |
| Autentisering | Ingen tidigare. |
| Integrationer | `functions/api/chat.js` (Claude via `ANTHROPIC_API_KEY`), Formspree för formulär, Open-Meteo. |
| Hemligheter | Cloudflare Pages miljövariabler. Inga hemligheter i repot. |
| Driftsättning | Manuellt: `git archive HEAD` → `wrangler pages deploy` till projektet `kelagroup-website`. Git-kopplingen i Pages pekar på ett borttaget repo, så push publicerar inte. |
| UI-komponenter | Varumärkets färger (rosa `#F3D3D7`, vinröd `#5C1A26`), Archivo Black och KELA-ordmärket (SVG från `badge/`) återanvänds. Sajtens komponenter är byggda för marknadsföring och återanvänds inte i adminpanelen. |
| Serverfunktioner | Cloudflare Pages Functions finns redan → naturligt att bygga vidare på. |

**Beslut:** bygga vidare på befintlig plattform i stället för ett parallellt system: Pages Functions (TypeScript) + **Cloudflare D1** (SQLite, kan placeras i EU) + ett adminskal i vanilla ES-moduler utan byggsteg (samma arbetssätt som sajten, inga npm-beroenden i produktion).

**Risker som hittades i befintlig kod**
- `functions/api/chat.js` returnerar upp till 300 tecken av felmeddelandet från Anthropic till besökaren (`detail`). Låg risk, men bör tas bort. *Inte ändrat – utanför fas 1.*
- Pages-projektets Git-koppling pekar på ett borttaget repo. Driftsättning sker manuellt (se `scripts/deploy.sh`).
- `wrangler pages deploy .` laddar upp **alla** filer i mappen som statiska filer. Kör aldrig deploy direkt från arbetskatalogen (då kan t.ex. `.dev.vars` följa med) – använd `scripts/deploy.sh`.

## 2. Arkitektur

```
Webbläsare ──► Cloudflare Pages
                 ├─ statiska filer: webbplatsen + /os/ (adminskal, ES-moduler)
                 └─ Pages Functions (TypeScript)
                      ├─ /api/os/[[path]].ts    → functions/_lib/router.ts (auth, CSRF, RBAC) → routes/*
                      ├─ /offert/[token].ts     → renderar offertdokumentet (server-side, CSP med nonce)
                      ├─ /api/offert/[[path]].ts→ visning / godkänn / avböj via länk
                      └─ /functions/[[path]].ts → 404 (källkod exponeras aldrig)
                          │
                          ▼
                     Cloudflare D1 (binding: DB)
```

- **Delad beräkning:** `os/lib/calc.js` används av både webbläsaren (direkt återkoppling) och servern (som alltid räknar om – klientens summor litas aldrig på).
- **Belopp:** heltal i öre + valutakod. Moms och rabatt i baspunkter (2500 = 25 %). Antal i tusendelar. Avrundning halva uppåt, per momssats.
- **Multi-tenant från start:** varje tabell har `org_id` och varje fråga filtreras på sessionens företag (testat). Se avsnitt 7.

### Datamodell (`db/migrations/0001_fas1_grund.sql`)
`organizations`, `users`, `memberships` (roll per företag), `invites`, `sessions`, `rate_limits`, `counters` (offertnummer), `customers`, `contacts`, `leads`, `deals`, `activities`, `tasks`, `services`, `service_price_versions`, `quotes`, `quote_versions`, `quote_items`, `quote_events`, `quote_acceptances`, `quote_templates`, `audit_logs`.

**Offertversioner:** när en offert skickas fryses versionen (`locked = 1`) med en fullständig kopia (`snapshot_json`) och en SHA-256-kontrollsumma. Kunden ser alltid den frysta kopian – ändringar i tjänstekatalogen, kundregistret eller ett nytt utkast påverkar den aldrig. Ändringar görs i en ny version. Godkännande kräver att kunden godkänner exakt den kontrollsumma som visas.

## 3. Vad fas 1 innehåller

- Skyddad inloggning: lösenord (PBKDF2-SHA256, 100 000 iterationer via WebCrypto), MFA (TOTP, krävs för superadmin/admin), sessioner i D1, inbjudningar via engångslänk.
- Grundlayout med hela navigationen (fas 2/3-moduler är markerade och visar vad som krävs – inga påhittade siffror).
- Dashboard med riktiga nyckeltal, aktivitetsflöde och prioriterad att-göra-lista. Fakturerat/betalt/bokfört visas som "ej kopplat" tills Fortnox finns.
- CRM: kunder, kontaktpersoner, anteckningar/samtal/möten, uppgifter, GDPR-export, arkivering.
- Leads → kund + affär. Säljpipeline (Kanban med dra-och-släpp + lista, filter, förlustorsak).
- Tjänstekatalog med versionshanterade priser, interna kostnader och marginal (förifylld med tjänstenamn, **utan priser**).
- Offertbyggare: kund (eller ny kund direkt), tjänster från katalogen, fria rader, engångs-/månadskostnad, valfria tillägg, rad- och offertrabatt, moms per rad, leveranstid, betalningsvillkor, villkor, genomförandeplan (inkl. standardplan för ny hemsida), mallar, duplicering, autosparning.
- Förhandsgranskning, PDF (utskriftsoptimerad A4 via webbläsarens "Spara som PDF"), säker delningslänk, status (utkast → granskning → skickad → öppnad → accepterad/avböjd/utgången), versioner och händelselogg.
- Automatisering vid godkännande: affär → vunnen, kund → aktiv, uppgifter för projektstart/avtal/fakturering, uppföljningsuppgift stängs. Idempotent. Välkomstmejl skickas **inte** (ingen e-postintegration) – det loggas som överhoppat.
- Roller: Superadmin, Administratör, Säljare, Projektledare, Ekonomi (+ Kund förberedd för portalen).
- Aktivitetslogg (revisionslogg) över inloggningar och alla ändringar.

## 4. Säkerhet

Implementerat:
- All åtkomstkontroll på servern (`requirePerm`), alla frågor filtreras på `org_id`.
- Sessionstoken lagras bara som SHA-256-hash. Kaka: `HttpOnly; SameSite=Strict; Secure` (prefix `__Host-` på https). 12 h max, 4 h inaktivitet. Ny session efter MFA. Byte av roll/status loggar ut användaren.
- CSRF: egen header + Origin-kontroll + SameSite=Strict.
- Rate limiting i D1 (inloggning, MFA, inbjudan, publika offertåtgärder, lead-API).
- MFA-hemligheter och delningslänkar krypteras med AES-GCM (`OS_SECRET_KEY`). Återanvändning av TOTP-kod blockeras.
- Validering av all indata på servern, parametriserade SQL-frågor, escaping i all HTML (XSS testat), strikt CSP på `/os/*` och offertsidorna.
- Offertlänkar: 256 bitars slumptoken, uppslag via hash, `noindex`, `no-referrer`, kan ersättas (gamla slutar gälla).

Rekommenderas inför produktion (ej gjort):
- **Cloudflare Access** (gratis upp till 50 användare) framför `/os/*` och `/api/os/*` som ett extra lager med SSO.
- Cloudflare WAF rate limiting-regel för `/api/os/auth/*`.
- D1 Time Travel (30 dagars återställning ingår) + regelbunden export till R2 för längre lagring.
- Återställningskoder för MFA (i dag återställer en superadmin MFA för andra användare).
- Gallringsrutiner (t.ex. radera rate_limits/sessioner automatiskt via Cron Trigger) och hårdradering av personuppgifter på begäran (i dag finns export + arkivering).
- Personuppgiftsbiträdesavtal: Cloudflare (DPA finns i dashboarden). Kontrollera att D1 skapas med EU-jurisdiktion.

## 5. Miljövariabler och hemligheter

| Namn | Typ | Krävs | Beskrivning |
|---|---|---|---|
| `DB` | D1-binding | Ja | Databasen `kela-os`. Läggs till under Pages → Settings → Bindings. |
| `OS_SECRET_KEY` | Secret | Ja | 32 slumpbyte i base64. Krypterar MFA-hemligheter och offertlänkar. **Byts den blir befintliga MFA-kopplingar och länkar ogiltiga.** Skapa: `openssl rand -base64 32` |
| `OS_SETUP_TOKEN` | Secret | Bara vid installation | Engångsnyckel för att skapa första superadmin. Ta bort efteråt. Skapa: `openssl rand -hex 24` |
| `OS_ENV` | Variabel | Nej | Sätts bara lokalt till `development`. |

Lokalt läses värdena från `.dev.vars` (gitignorerad).

## 6. Driftsättning (görs av Mikaela – Claude får inte publicera)

```bash
# 1. Skapa databasen i EU (en gång). Klistra in database_id i db/wrangler.toml.
npx wrangler@4 d1 create kela-os --jurisdiction eu

# 2. Skapa tabellerna i produktionsdatabasen
npx wrangler@4 d1 migrations apply kela-os --remote --config db/wrangler.toml

# 3. I Cloudflare: Pages → kelagroup-website → Settings
#    - Bindings: D1 database, namn DB → kela-os
#    - Variables and Secrets: OS_SECRET_KEY och OS_SETUP_TOKEN (typ Secret)

# 4. Publicera (från committad kod)
bash scripts/deploy.sh

# 5. Gå till https://kelagroup.se/os/, ange installationsnyckeln och skapa ditt konto + MFA.
# 6. Ta bort OS_SETUP_TOKEN i Cloudflare.
```

## 7. Lokal utveckling och tester

```bash
npm install
npm run db:migrate:local
npm run dev        # http://localhost:8788/os/  (läser .dev.vars)
npm test           # 25 integrationstester mot en tom, temporär databas
npm run typecheck
```

Testerna startar en egen server och täcker: obehörig åtkomst, CSRF, installation, MFA (inkl. återanvänd kod), rate limiting, kakflaggor, CRM-flöden och sök (inkl. SQL-injektion), lead-konvertering, prisversioner, exakt moms-/rabattberäkning, offert spara/öppna, förhandsgranskning, utskick och låsning, länkåtkomst, öppningsspårning, versionshistorik med kontrollsummor, godkännande (fel version, dubbelklick, automatiseringar), XSS, riktig PDF via headless Chrome, roller, inaktivering, separation mellan företag, dashboard, revisionslogg, GDPR-export och att befintliga sidor/chatten fungerar.

## 8. Externa integrationer som saknas

| Integration | Behövs för | Status |
|---|---|---|
| E-post (EU-baserad, t.ex. Postmark EU/Brevo) | Skicka offerter, inbjudningar, välkomstmejl | Ej kopplad – länkar delas manuellt / via "Mejla länken" (öppnar ditt mejlprogram) |
| E-signering (Scrive, Oneflow, Visma Sign) | Juridiskt starkare signering av offert/avtal | Ej kopplad – datamodellen har fält för leverantör, referens och bevis |
| Fortnox (OAuth2) | Fakturor, betalstatus, intäkter | Fas 2 |
| Cloudflare R2 | Dokument och filer | Fas 2 |
| Övervakning (UptimeRobot/Better Stack) | Driftstatus | Fas 3 |

## 9. Väg mot SaaS

Redan på plats: `organizations` + `memberships` (en användare kan tillhöra flera företag), `org_id` på all data och i alla frågor, roller per företag, företagsinställningar (`settings_json`, valuta, standardmoms), egna tjänstekataloger och offertnummer per företag. Kvar: val av företag vid inloggning, registrering, logotyp/färger per företag, prenumerationer och modulpaket. Systemhändelser utan företag (t.ex. inloggningsförsök mot okända konton) visas i dag för superadmin – i SaaS-läge ska de bara visas för plattformsägaren.
