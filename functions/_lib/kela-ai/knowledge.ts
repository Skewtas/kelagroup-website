// KELA AI – grundkunskap om Kela Group. Bygger på webbplatsens innehåll (llms-full.txt, uppdaterad 2026-10-25).
// Kan skrivas över per tenant från adminpanelen (Kela AI → Kunskap).
export const KELA_KNOWLEDGE = `# Kela Group AB
- Teknikdriven byrå i Stockholm (org.nr 559578-1971) som bygger hemsidor, system, appar och AI-automationer åt företag i Sverige och hela Europa. Slogan: "Vi bygger bort onödigt arbete".
- Allt Kela säljer kör teamet självt varje dag i sina egna verksamheter – bland annat städbolaget Stodona.
- Grundare och kontaktperson: Mikaela Wigert (affär, produkt & automation). E-post: hej@kelagroup.se. Svar inom 24 timmar på vardagar.
- Litet, drivet team som kodar från grunden och använder AI i varje steg: korta ledtider, enkla att förvalta. Kunden äger sin lösning och data och blir aldrig inlåst.
- Datalagring: Kela placerar kundens databas inom EU när det är möjligt och redovisar exakt var varje del lagras i personuppgiftsbiträdesavtalet. Lova aldrig att all data lagras inom EU – vissa tjänster (till exempel AI-tjänster och kartor) drivs av amerikanska leverantörer. Hänvisa detaljfrågor till hej@kelagroup.se.
- Garanti: Kela går igenom kundens system och flöden och visar var tid och pengar läcker. Hittar de inget att spara kostar genomgången ingenting.
- Arbetssätt: 1) hitta problemet (kostnadsfri kartläggning) 2) bygga lösningen (offert, design, utveckling – kunden ser allt löpande) 3) mäta resultatet i kronor och tid 4) förbättra steg för steg.

# Priser
Kela visar inga priser. Varje kund får en offert efter behov – genomgång, kartläggning och offert är kostnadsfria och utan förpliktelse. Projekt kan delbetalas. Offertguide: /priskalkylator.

# Tjänster (sida inom parentes)
- Hemsidor & e-handel (/bygga-hemsida, /billig-hemsida, /hemsida-smaforetag): handkodade, snabba, mobilanpassade, SEO från start, enkelt CMS, kan få chatt-, offert- eller bokningsflöden. Enklare hemsida live på 1–2 veckor; större projekt/e-handel oftast 3–6 veckor.
- System & portaler (/bygga-system, /affarssystem-crm): affärssystem, CRM, säljpipeline, offerter och fakturor, rekryterings- och bokningssystem, kund- och personalportaler, dashboards, intranät, lager. Modulärt, integrerat via API, byggt för GDPR, databasen inom EU när det är möjligt. Första version ofta i drift på 4–8 veckor.
- Bokningssystem (/bokningssystem): kalender i realtid, betalning/deposition, automatiska bekräftelser och påminnelser via mejl och sms, självservice för om- och avbokning, resurshantering. Byggs in i hemsidan.
- Automationer (/bygga-automationer): offerter, kundtjänst, fakturering, uppföljning, påminnelser, dataflöden mellan system, automatiska rapporter. Första automation ofta i drift inom ett par veckor.
- AI-agenter & AI-chatt (/ai-agenter): kundtjänst, sälj, offerter, bokning, support, rapporter. Tränas på företagets material och kopplas till dess system. Avlastar människor – ersätter dem inte.
- Appar för iOS & Android (/bygga-app): native, push, offline, betalningar, lansering i App Store och Google Play. Enklare app några veckor; avancerade 2–4 månader.
- Integrationer (/integrationer): Fortnox, Visma, Business Central, Timewave, Tengella, Shopify, WordPress – allt med API. Kela är inte officiell partner till leverantörerna.
- SEO (/sokmotoroptimering) och GEO – synas och citeras i ChatGPT, Perplexity, Gemini, Copilot, Claude och Google AI Overviews (/geo-optimering). Ingen kan garantera placering i AI-svar.
- Marknadsföring (/marknadsforing): Meta-annonser, Google Ads, content för Instagram och TikTok, nyhetsbrev.

# Färdiga moduler i skarp drift (/produkter)
Byggda för städbranschen men anpassas även för andra branscher. Kopplas via API till affärssystemet. Varje modul fungerar på egen hand.
- Bokis (/produkter/bokis) – ENDAST för städbranschen: onlinebokning som räknar pris direkt, restid mellan uppdrag, automatisk schemaläggning, rätt person på rätt jobb, tilläggstjänster, abonnemang, orderbekräftelse, välkomstmejl/sms och påminnelser. Kalla aldrig salongs- eller frisörbokning för Bokis.
- Chattis (/produkter/chattis) – AI-chattbot som pratar direkt med affärssystemet. Ca 95 % av ett städbolags mejl och kundservice handlar om bokningar och fakturor – det sköter Chattis: bokning, ombokning, avbokning, sjukdom, fakturafrågor, beställningar. Föreslår nya tider, samma städare om kunden vill.
- Feedis – sms-betyg efter tjänsten; bra feedback till personalen, missnöje till kontoret med åtgärdsförslag, nöjda kunder får länk till Google/Trustpilot/Reco.
- Påminnis – automatiska mejl- och sms-påminnelser om obetalda fakturor.
- Headof – dashboard live mot affärssystemet: försäljning, timmar, bokningar, nyckeltal.
- Personalapp – in/utcheck med GPS, kvalitetskontroller, tid- och materialrapport, AI-arbetsledare som besvarar ca 95 % av frågorna och larmar en riktig arbetsledare annars.
- Kundapp – kunden ser, ändrar och avbokar bokningar, lämnar feedback, hämtar fakturainfo.
- Rekryteringsverktyg – likt Teamtailor: kandidatbank, automatisk återkoppling, onboarding.
- Under utveckling, inte lanserade: Avtalshantering och Värva vänner & personal. Säg tydligt att de inte är lanserade.

# Branscher
Städ & service (/bransch-stad, /stadbolag – digitaliseringsplan i fyra faser efter kostnadsfri kartläggning), Skönhet & salong (/bransch-skonhet), Frisör (/bransch-harstylist), Makeupartister (/bransch-makeup), Frilansare & konsulter (/bransch-frilans), Bröllop (/bransch-brollop), Rekrytering & personal (/bransch-rekrytering).

# Kundcase: Stodona AB (/case)
Städbolag i Stockholm som kör hela verksamheten på Kelas system: hemsida med bokning (Bokis), Feedis, fakturaautomation via Fortnox (Påminnis), AI-chatten "Camilla" för webb och mejl, rekrytering, personalapp, kundapp och automatiserad administration. Resultat enligt kelagroup.se: ≈ 565 000 kr lägre kostnad per år, 4 → 1 person i administrationen, 3 heltidstjänster frigjorda, merförsäljning inbyggd i kundflödet. Använd bara dessa siffror.
Andra kunder som visas på sajten: VB FAST, ASH Sweden, Makeup by Camilla, Xllenta, Tailor Events, BSG – Bygg och saneringsgruppen. Hitta inte på detaljer om dem.

# Kontakt
Kontaktformulär /kontakt, offertguide /priskalkylator, e-post hej@kelagroup.se. Möten: video, fysiskt i Stockholm eller telefon.`;
