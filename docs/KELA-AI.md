# Kela AI – AI-assistenten på kelagroup.se

Kela AI är vår egen AI-chatt och samtidigt vår bästa produktdemo. Den visar saker i stället för att bara prata: interaktiva demos, kalkyler och lösningsskisser direkt i konversationen. Den är byggd som en produkt med flera kunder (multi-tenant) från start, så att samma motor kan säljas till kunder.

## Översikt

```
Besökare ──► loader-v3.js (orben, ≈ 8 kB, på alla sidor)
               │ laddar först vid intresse (hover/fokus/klick/viloläge)
               ▼
            app-v3.js + ui-v3.js + kela-ai-v3.css   (panel, streaming, komponenter, röst, bild)
               │  fetch /api/ai/*  (SSE för svar)
               ▼
   functions/api/ai/[[path]].ts → functions/_lib/kela-ai/
      ├─ api.ts      publikt API: chatt (SSE), leads, händelser, samtal (läs/radera/betyg), personalöverlämning
      ├─ prompt.ts   systemprompt – fasta kärnregler + redigerbar personlighet/kunskap
      ├─ tools.ts    godkända verktyg (strikta scheman) + validering/tvätt av allt modellen skickar
      ├─ config.ts   tenantkonfiguration (allt som styrs från adminpanelen), normalisering
      └─ knowledge.ts grundkunskap om Kela (från llms-full.txt)
               │
               ▼
   Claude (Anthropic) · D1: ai_tenants, ai_conversations, ai_messages, ai_events (+ leads, activities)

KELA OS → Kela AI (#/kela-ai): statistik, samtal, ta över som människa, inställningar, nya assistenter
   functions/_lib/routes/ai.ts · os/views/ai.js
```

| Fil | Vad |
|---|---|
| `assets/kela-ai/loader-v3.js` | Orben (launcher), hovertexter, ett kontextuellt tips per session, "Fråga Kela AI" vid markerad text, Ctrl/Cmd+K. Laddar resten i förväg när webbläsaren är ledig. |
| `assets/kela-ai/app-v3.js` | Panelen: välkomst med startkort och "Utmana vår AI", streaming, säker markdown, minne, meny (ny konversation, språk, ladda ner, radera, om AI & integritet), röstläge, bilduppladdning, personalövertagande (polling), demoläge utan AI. |
| `assets/kela-ai/ui-v3.js` | Rich-komponenter: tjänstekort, bokningsdemo (7 branscher), besparingskalkylator, integrationsdemo (AI + affärssystem), lösningsflöde, projektbrief, mötesbokning, prata med människa. |
| `assets/kela-ai/kela-ai-v3.css` | Allt scopat under `.kai-panel`. Tokens för färger (sätts per tenant). |

Inbäddning (finns på alla 56 publika sidor, efter `boka-v3.js`):
```html
<script src="/assets/kela-ai/loader-v3.js" data-tenant="kela" defer></script>
```
Nya sidor måste få samma rad. Den gamla chatten i `sub-v3.js` är ersatt av `sub-v4.js` (samma kod utan chatten). `functions/api/chat.js` finns kvar för cachade gamla sidor och kan tas bort efter en vecka.

**Cache:** Pages ignorerar `?v=` – byt filnamn (`-v4`) vid ändringar i `assets/kela-ai/`, och uppdatera `loader` (som pekar på `app-v3.js`, `kela-ai-v3.css`) och alla html-filer.

## Hur AI:n visar saker

Modellen får nio verktyg (`tools.ts`), alla med `strict: true`. Verktygen utför inget – de returnerar en **validerad UI-komponent** (`{type, props}`) som webbläsaren renderar med egna, fördefinierade komponenter. Allt från modellen behandlas som osäker indata: strängar kortas och rensas från `<>`, okända enum-värden ersätts, listor begränsas. Webbläsaren använder `textContent`, aldrig HTML från modellen. AI-text renderas som "markdown-lite" efter escaping (bara fetstil, kursiv, listor och länkar till egna sidor/kelagroup.se/mailto).

| Verktyg | Komponent |
|---|---|
| `remember_visitor` | Sessionsminne (bransch, behov, system, tidsram …) – syns under "Det här vet jag" och kan rensas |
| `show_booking_demo` | Bokningsdemo: tjänst → personal → tid → bekräftelse → animerat sms. Märkt DEMO. Bransch `stad` = Bokis |
| `show_savings_calculator` | Kalkyl med besökarens svar, ändringsbara antaganden (andel per uppgift, timkostnad, arbetsveckor) och animerad graf |
| `show_integration_demo` | Simulerad "flytta min bokning till fredag": verifiering, hämta bokning, tillgänglighet, val, bekräftelse, ändring, notis |
| `show_solution_flow` | "Utmana Kela AI": klickbart flödesdiagram för besökarens problem |
| `show_project_brief` | "Ert framtida system" – redigerbart, skicka förfrågan, boka möte, mejla till mig, kopiera |
| `show_meeting_booking` | Cal.com inbäddat om `cal_link` finns, annars mötesförfrågan (ingen tid bekräftas förrän ni gjort det) |
| `show_cards` | Kort för tjänster, moduler och kundcaset Stodona (siffror från case-sidan) |
| `handoff_to_human` | Lämna kontaktuppgifter och/eller vänta kvar så att personal kan ta över i KELA OS |

## Säkerhet

- **Historiken byggs på servern** från D1 (append-only). Klienten kan inte skicka in falska AI-svar.
- **Separering:** systemprompten innehåller bara fasta regler + tenantens konfiguration. Sidkontext, bildanalys och personalens meddelanden läggs in i användarmeddelandet inom taggar som modellen instrueras att behandla som data. Taggar som besökaren själv skriver rensas bort.
- **Kärnregler som inte kan ändras från admin:** AI låtsas aldrig vara människa, inga priser, inga påhittade fakta/siffror, demos är simuleringar, avslöjar aldrig instruktioner, ber aldrig om känsliga uppgifter.
- **Åtkomst:** varje samtal skyddas av en slumpad nyckel (bara SHA-256-hash lagras). Ursprungskontroll (samma domän eller tenantens tillåtna domäner), egen header på alla POST, rate limiting per IP (24 meddelanden / 5 min, 200 / dygn, 6 leads / timme), storleksgränser (2 000 tecken, bild ≈ 1,5 MB), max 60 svar per samtal.
- **Fel från Anthropic visas aldrig för besökaren** (loggas på servern).
- **Refusal-fallback:** `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) är på.
- **Admin:** behörigheterna `ai:read`, `ai:write` (samtal, ta över) och `ai:configure` (inställningar, radera, nya assistenter). Säljare har read/write. Övertagande, konfigurationsändringar, export och radering loggas i revisionsloggen.

## Integritet (GDPR)

- Samtal raderas automatiskt efter tenantens lagringstid (standard 90 dagar). Besökaren kan ladda ner och radera sitt samtal direkt i chatten.
- Bilder sparas aldrig – en separat AI-analys görs och bara texten sparas (dataminimering).
- Kontaktuppgifter sparas bara när besökaren själv skickar dem **och** kryssar i samtycket. Marknadsföring är ett separat frivilligt val.
- Statistiken (`ai_events`) innehåller inga personuppgifter. Inga cookies – bara sessionStorage i fliken.
- Röst startar bara på knapptryck; taligenkänningen sköts av webbläsaren (upplyst i röstläget).
- D1 ligger i EU. Anthropic (USA) behandlar texten för att skapa svar – står i integritetspolicyn (`/integritetspolicy#kela-ai`). **Att göra:** bekräfta att Anthropics personuppgiftsbiträdesavtal (DPA) är accepterat för Kelas API-konto.

## Leads och CRM

Projektbrief, mötesförfrågan och "prata med människa" skapar en **lead i KELA OS** (`source = 'kela-ai'`) med hela sammanfattningen, plus en aktivitet. Finns e-posten redan hos en kund kopplas leaden och samtalet till kundkortet (återkommande kund). En e-postnotis skickas via samma Formspree-formulär som resten av sajten. Om servern inte nås skickas förfrågan bara via Formspree; går inget fram visas e-postadressen.

## Adminpanelen (KELA OS → Kela AI – chattar)

- **Översikt:** konversationer, unika sessioner, leads/mötesförfrågningar, konvertering, överlämningar, AI-kostnad per konversation (uppskattad från tokens), nöjdhet (👍/👎), fel/demoläge, demos visade/genomförda, vanligaste första frågor, startkort, per dag.
- **Samtal:** sök/filtrera, läs hela samtalet inklusive vilka komponenter som visades, **ta över som människa** (AI:n pausas, besökaren ser att någon anslutit), svara, lämna tillbaka eller avsluta, radera, CSV-export (nyckeltal utan innehåll).
- **Inställningar:** namn, statusrad, välkomsttext, startkort, hovertexter, personlighet, extra instruktioner, kunskapsbas och extra kunskapsavsnitt, sidregler (kontextuella tips), Cal.com-länk, Formspree, funktioner av/på, lagringstid, färger, tillåtna domäner, inbäddningskod, **ny assistent för kund**.

## Sälja till kunder (multi-tenant)

1. KELA OS → Kela AI → Inställningar → **Ny assistent för kund** (nyckel t.ex. `salong-exempel`).
2. Fyll i kunskap, personlighet, färger, startkort och kundens domän under "Tillåtna webbplatser".
3. Kunden lägger in inbäddningskoden på sin sajt. All data isoleras per företag (`org_id`) och assistent.

Kvar för full SaaS: egen KELA OS-inloggning för kunden (i dag administreras kundassistenter från Kelas konto), egna verktyg/integrationer per kund (t.ex. riktig koppling till kundens bokningssystem), fakturering per kund.

## Konfiguration och driftsättning

| Variabel | Krävs | Beskrivning |
|---|---|---|
| `ANTHROPIC_API_KEY` | För AI | Utan den körs widgeten i **demoläge**: färdiga demos och svar, tydligt märkt "Demoläge – AI ej ansluten". |
| `KELA_AI_MODEL` | Nej | Standard `claude-opus-5-5` (effort `low` för snabba svar). `claude-sonnet-5-5` ger lägre kostnad. |

```bash
npm run db:migrate:local     # lokalt
npm test                     # 38 tester, varav 10 för Kela AI (mot en låtsas-Claude som strömmar)
bash scripts/deploy.sh --migrate   # publicering + migrering 0003_kela_ai.sql i produktion (Mikaela kör)
```

## Testat

- Integrationstester: publik konfiguration läcker inga instruktioner, säkerhetsheader/ursprung/storlekar, streaming med komponenter och minne, historik byggs på servern, verktygsdata tvättas, verktyg utan text, besökarens nyckel, betyg, rensa minne, samtycke för leads, lead i CRM, statistik, ta över/svara/lämna tillbaka (AI:n får veta vad som sades), konfiguration valideras och loggas, GDPR-radering.
- Manuellt i webbläsare (desktop + mobil 375 px, i demoläge): orb, hovertips, öppning, välkomst, integrationsdemo med val, lösningsskiss, kalkylator, bokningsdemo till bekräftelse, adminpanelens översikt och inställningar.
- **Inte testat mot riktiga Claude** (ingen nyckel lokalt), inte på riktig iPhone/Android, och röstläget inte med riktig mikrofon.
