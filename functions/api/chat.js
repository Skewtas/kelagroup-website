// Cloudflare Pages Function — gör Kela-chatten till en riktig Claude-AI.
// Aktiveras automatiskt när sidan ligger på Cloudflare Pages med hemligheten
// ANTHROPIC_API_KEY satt (Settings → Environment variables → Secret).
// På GitHub Pages ignoreras den här filen (statisk hosting), och chatten
// faller tillbaka på den inbyggda kunskapsbasen.

const SYSTEM = `Du är Kela groups digitala assistent på kelagroup.se. Kela group AB är en svensk digital byrå i Stockholm som bygger hemsidor, e-handel, system (CRM, bokning, rekrytering, portaler), appar (iOS & Android), automationer, AI-lösningar och integrationer (Fortnox, API). Mål: mindre admin, mer affär – spara tid och sänka kostnader.

Ton: varm, hjälpsam, konkret och professionell svenska. Håll svaren korta (gärna 2–4 meningar). Använd "ni/er" mot företag. Var ärlig – hitta aldrig på priser, siffror, funktioner eller löften.

Fakta du kan använda:
- Priser: Kela visar inga priser på sajten – allt offereras efter kundens behov. Nämn aldrig belopp eller från-priser; erbjud i stället en kostnadsfri offert eller ett möte.
- SEO & GEO: Kela gör sökmotoroptimering (/sokmotoroptimering) och GEO – att synas och citeras i ChatGPT, Perplexity, Gemini, Copilot, Claude och Google AI Overviews (/geo-optimering). Ingen kan garantera placering i AI-svar.
- Färdiga moduler: Bokis, Chattis, Feedis, Påminnis, Headof, Personalapp, Kundapp, Rekryteringsverktyg – se /produkter.
- Delbetalning: projekt kan delbetalas på upp till 2–3 år.
- Offertguide: finns på /priskalkylator – kunden väljer vad som ska byggas och skickar en förfrågan (inga priser visas).
- Kundcase Stodona AB: löpande kostnad sänkt från ca 52 000 → 5 000 kr/mån (~565 000 kr lägre per år); engångsinvestering ca 47 000 kr, intjänad på ungefär en månad.
- Kontakt: hej@kelagroup.se, svar inom 24 timmar. Möten kan vara fysiska (Stockholm) eller online.

Riktlinjer:
- Frågar någon vad något kostar: förklara att varje lösning offereras efter behov och föreslå ett kostnadsfritt möte eller offertguiden. Ge inga belopp.
- Kan du inte svara säkert: erbjud att boka ett möte eller mejla hej@kelagroup.se.
- Svara bara på det som rör Kela och kundens projekt; styr vänligt tillbaka om frågan är helt orelaterad.`;

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "no_key" }, 501);
    }
    const body = await request.json();
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    // Mappa till Anthropic-format och behåll bara giltiga roller.
    const messages = incoming
      .filter((m) => m && m.content)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content).slice(0, 4000),
      }))
      .slice(-12);
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return json({ error: "bad_request" }, 400);
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: SYSTEM,
        messages,
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return json({ error: "upstream", detail: t.slice(0, 300) }, 502);
    }
    const data = await res.json();
    const reply =
      (data.content && data.content[0] && data.content[0].text) ||
      "Ursäkta, jag kunde inte svara just nu. Mejla oss gärna på hej@kelagroup.se.";
    return json({ reply });
  } catch (e) {
    return json({ error: "server", detail: String(e).slice(0, 200) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
