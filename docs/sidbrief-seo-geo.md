# Brief: nya sidor på kelagroup.se (SEO + GEO), 2026-10-25

Gemensamma regler för alla som skriver nya sidor. Repo: `/Users/mikaela/Kela group AB` (statisk sajt på Cloudflare Pages, rena adresser utan `.html`).

## Mall och teknik
- **Mall:** `bygga-app.html`. Kopiera `<head>`-strukturen, `<header class="nav">`, `<div class="mmenu">`, `<footer>` och script-taggarna i slutet **tecken för tecken** (meny och sidfot uppdateras senare med skript på alla sidor – de måste vara identiska).
- Byt bara ut titel, beskrivning, canonical, og/twitter-taggar, JSON-LD och innehållet i `<main>`.
- Alla sökvägar ska vara **absoluta**: `/assets/...`, `/site.webmanifest`, länkar som `/kontakt`, `/produkter/bokis`. Aldrig `.html` i länkar och aldrig relativa sökvägar (sidor ligger i undermappar).
- Fil → adress: `geo-optimering.html` → `https://kelagroup.se/geo-optimering`, `produkter/bokis.html` → `https://kelagroup.se/produkter/bokis`.
- Använd bara befintliga CSS-klasser (`/assets/pop-v6.css`, `/assets/sub-v1.css`). Titta på `bygga-app.html`, `bygga-system.html`, `stadbolag.html` och `bransch-stad.html` för komponenter: `page-hero` (`ph-grid`, `ph-copy`, `ph-kicker`, `ph-lead`, `ph-actions`), `breadcrumb`, `prose`, `sec-head`, `features`/`fcard`, `steps`/`step`, `split` + `faq` (`details/summary/.ans`), `cta`. Hero utan bild: `class="page-hero"` utan `has-visual` och utan `ph-visual` (kolla att det ser bra ut i en befintlig sida som gör så, annars en enkel visual av befintliga mockup-klasser). Inga nya CSS-filer; korta inline-styles går bra.
- **Inga** nya JS-filer. Boka-knappar: `<a class="btn btn-dark" href="/kontakt">Boka möte <span class="arr" aria-hidden="true">→</span></a>` (öppnar bokningsrutan automatiskt). Sekundär: `<a class="btn btn-line" href="/priskalkylator">Få en offert</a>`.

## SEO-krav per sida
- `<title>` max ~60 tecken, slutar med `| Kela` eller `| Kela group`. Meta description 140–160 tecken.
- Exakt en `<h1>` med huvudsökordet. Logisk h2/h3-struktur.
- canonical, og:url och JSON-LD-url = ren adress.
- JSON-LD `@graph`: kopiera Organization-, Person- och WebSite-noderna från `bygga-app.html` oförändrade. Lägg till: `WebPage` (+ `FAQPage` om sidan har FAQ, som i mallen), `BreadcrumbList`, och en huvudnod som passar (`Service` för tjänster, `SoftwareApplication` med `applicationCategory: "BusinessApplication"` och `offers` UTAN pris för produkter, `BlogPosting` för artiklar med `author` = `{"@id":"https://kelagroup.se/#mikaela"}`, `datePublished`/`dateModified` 2026-10-25). `dateModified: "2026-10-25"`.
- FAQ i JSON-LD måste ha **samma text** som den synliga FAQ:n. 4–6 frågor per sida.
- JSON-LD måste vara giltig JSON – kontrollera med `python3 -c "import json,re,sys; ..."`.
- 4–8 interna länkar till relevanta befintliga/nya sidor (se adresslistan nedan).

## GEO-krav (för att AI-tjänster ska citera sidan)
- Första stycket under h1 (`ph-lead`) ska vara ett **direkt svar** på 40–60 ord: vad det är, för vem, vad det ger. Nämn "Kela group" vid namn.
- Korta, faktatäta stycken. **Punktlistor** för funktioner (Mikaela vill ha punktform, inte textklumpar).
- Tydliga definitioner ("X är …"), frågeformade h2:or där det passar, en rad "Senast uppdaterad 25 oktober 2026" i sidans innehåll.
- Konsekventa namn: "Kela group" / "Kela group AB", produkterna stavas exakt Bokis, Chattis, Feedis, Påminnis, Headof, Personalapp, Kundapp, Rekryteringsverktyg.

## Ton och innehåll
- Svenska, varm, konkret, "ni/er" mot företag. Inga engelska anglicismer i onödan.
- **Inga priser eller belopp** för Kelas tjänster (ingen "från X kr"). Pris = "offert efter era behov, kostnadsfritt och utan förpliktelse". Delbetalning på upp till 2–3 år får nämnas.
- **Hitta aldrig på** kunder, statistik, resultat, certifieringar, partnerskap, adresser eller personer. Använd bara fakta nedan. Är något osäkert: formulera generellt och skriv det i din rapport.

## Fakta du får använda
- Kela group AB, org.nr 559578-1971, Stockholm. Bygger hemsidor, system, appar, AI-automation för kunder i Sverige och Europa. Slogan "Vi bygger bort onödigt arbete". Kontakt hej@kelagroup.se, svar inom 24 h vardagar. Möten fysiskt i Stockholm eller online. Genomgång, kartläggning och offert kostnadsfritt.
- Grundare: Mikaela Wigert (affär, produkt & automation).
- Allt Kela säljer kör teamet självt i egna verksamheter, bl.a. städbolaget Stodona AB. Stodona-caset: ≈565 000 kr lägre kostnad per år (löpande kostnad från ca 52 000 till 5 000 kr/mån), 4 → 1 person i administrationen, 3 heltidstjänster frigjorda. (Använd ALDRIG siffran 2,7 Mkr.)
- Färdiga moduler i skarp drift, kopplade via API till affärssystem som Timewave, Tengella, Fortnox och Visma:
  - **Bokis** – bokningssystem som pratar direkt med schemasystemet: pris och restid, automatisk schemaläggning, rätt kompetens (kunden styr vem som får bokningen utifrån beläggning/erfarenhet), tilläggstjänster, abonnemang, används även internt för offerter/bokningar, skräddarsys. Kunden får orderbekräftelse, välkomstmejl/sms med info inför uppdraget och påminnelser (t.ex. om material).
  - **Chattis** – AI-chattbot kopplad till affärssystemet. Enligt Kela handlar ca 95 % av ett städbolags mejl/kundtjänst om bokning, ombokning, ändring, sjukdom, avbokning och fakturafrågor – Chattis sköter det själv: föreslår nya tider, ger samma städare, flyttar engångsuppdrag till kollega för att ge plats åt återkommande kund, tar beställningar.
  - **Feedis** – feedbacksystem: sms-betyg efter utfört uppdrag; bra betyg → automatiskt sms till personalen; dåligt → kontoret får besked med åtgärdsförslag; nöjd kund får länk till Google/Trustpilot/Reco.
  - **Påminnis** – påminnelser för obetalda fakturor: automatiska mejl/sms, bättre likviditet.
  - **Headof** – dashboard live mot affärssystemet: försäljning, timmar, bokningar, nyckeltal, skräddarsytt.
  - **Personalapp** – in-/utcheckning med GPS, kvalitetskontroller, AI-arbetsledare (besvarar ca 95 % av frågorna, larmar riktig arbetsledare annars), tid- och materialrapport.
  - **Kundapp** – kunden ser och ändrar bokningar, uppgifter, lämnar feedback, ser fakturor.
  - **Rekryteringsverktyg** – likt Teamtailor: kandidatbank, automatisk återkoppling, onboarding.
- Tjänster: SEO (sökmotoroptimering), GEO (synlighet i AI-sök), marknadsportal: Meta-annonser, nyhetsbrev via mejl & sms (segmentering, kundbrev, kampanjer, grattis-sms till kunder och personal), content för Instagram.
- Kelas egen sajt är byggd för GEO: strukturerad data (JSON-LD), `llms.txt`, öppen för AI-crawlers i robots.txt, FAQ-sidor, rena adresser.

## Adresser på sajten (länka bara till dessa)
Befintliga: `/`, `/tjanster`, `/bygga-hemsida`, `/billig-hemsida`, `/hemsida-smaforetag`, `/bygga-system`, `/affarssystem-crm`, `/bokningssystem`, `/bygga-automationer`, `/ai-agenter`, `/bygga-app`, `/priskalkylator`, `/case`, `/om-oss`, `/kontakt`, `/blogg`, `/stadbolag`, `/bransch-stad`, `/bransch-skonhet`, `/bransch-harstylist`, `/bransch-makeup`, `/bransch-frilans`, `/bransch-brollop`, `/bransch-rekrytering`.
Nya (skrivs parallellt): `/geo-optimering`, `/sokmotoroptimering`, `/marknadsforing`, `/produkter`, `/produkter/bokis`, `/produkter/chattis`, `/produkter/feedis`, `/produkter/paminnis`, `/produkter/headof`, `/produkter/personalapp`, `/produkter/kundapp`, `/produkter/rekryteringsverktyg`, `/integrationer`, `/integrationer/fortnox`, `/integrationer/visma`, `/integrationer/timewave`, `/integrationer/tengella`, `/webbyra-stockholm`, `/vanliga-fragor`, `/integritetspolicy`, `/cookies`, `/blogg/vad-kostar-en-hemsida`, `/blogg/bygga-hemsida-sjalv-eller-byra`, `/blogg/billig-hemsida-tips`, `/blogg/automatisera-kundtjanst-med-ai`, `/blogg/bokningssystem-bygga-eller-kopa`, `/blogg/vad-ar-en-ai-agent`, `/blogg/skraddarsytt-system-vs-standardsystem`, `/blogg/vad-ar-geo`.

## Gränser
- Skapa bara dina egna filer. Ändra **inga** befintliga filer. Committa inte. Starta inga servrar.
- Rapportera tillbaka: varje fil, title, en mening (för llms.txt) och allt du var osäker på.
