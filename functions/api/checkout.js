// Cloudflare Pages Function — beställning med handpenning via Stripe Checkout.
// Priset räknas om här på servern med samma prislista som kalkylatorn
// (assets/pricing-v1.js), så att beloppet inte kan ändras i webbläsaren.
//
// Aktivera: lägg in hemligheten STRIPE_SECRET_KEY i Cloudflare
// (Pages → kelagroup-website → Settings → Variables and Secrets).
// Utan nyckel svarar funktionen "no_stripe" och kalkylatorn skickar
// beställningen som förfrågan i stället.

import { PRICING, compute, summaryText, kr } from "../../assets/pricing-v1.js";
import { discountFor } from "./discount.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const clean = (v, n = 200) => String(v == null ? "" : v).replace(/[\r\n]+/g, " ").trim().slice(0, n);

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: "no_stripe" }, 501);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, 400); }

  // Bygg ett rent state-objekt av det som skickats in (bara kända nycklar)
  const raw = body.state || {};
  const pickKeys = (obj, list) => {
    const out = {};
    list.forEach((it) => { if (obj && obj[it.k] === true) out[it.k] = true; });
    return out;
  };
  const state = {
    solution: clean(raw.solution, 40),
    pkg: clean(raw.pkg, 40) || null,
    addons: pickKeys(raw.addons, PRICING.addons),
    features: pickKeys(raw.features, PRICING.features),
    design: clean(raw.design, 40) || "has",
  };

  const code = clean(body.code, 40).toUpperCase();
  const discount = discountFor(code, env);
  const p = compute(state, discount);
  if (p.mode !== "exact" && p.mode !== "range") return json({ error: "not_payable" }, 400);
  if (!(p.deposit > 0)) return json({ error: "not_payable" }, 400);

  const email = clean(body.email, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "bad_email" }, 400);

  const origin = new URL(request.url).origin;
  const summary = summaryText(state, code, discount);
  const f = new URLSearchParams();
  f.set("mode", "payment");
  f.set("locale", "sv");
  f.set("customer_email", email);
  f.set("success_url", origin + "/tack.html?session_id={CHECKOUT_SESSION_ID}");
  f.set("cancel_url", origin + "/priskalkylator.html?avbruten=1");
  f.set("line_items[0][quantity]", "1");
  f.set("line_items[0][price_data][currency]", "sek");
  f.set("line_items[0][price_data][unit_amount]", String(p.depositInclVat * 100));
  f.set("line_items[0][price_data][product_data][name]", "Handpenning " + Math.round(PRICING.depositRate * 100) + " % – " + p.sol.t);
  f.set("line_items[0][price_data][product_data][description]",
    "Projektpris " + kr(p.total) + " kr exkl. moms" + (discount ? " (efter rabatt " + code + ")" : "") + ". Resten faktureras enligt överenskommelse.");
  f.set("payment_intent_data[description]", "Kela – handpenning " + p.sol.t);
  f.set("metadata[namn]", clean(body.name, 120));
  f.set("metadata[foretag]", clean(body.company, 120));
  f.set("metadata[telefon]", clean(body.phone, 40));
  f.set("metadata[rabattkod]", discount ? code : "");
  f.set("metadata[projektpris_exkl_moms]", String(p.total));
  f.set("metadata[sammanfattning]", summary.slice(0, 480));

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded" },
    body: f.toString(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url) return json({ error: "stripe_error", detail: d && d.error && d.error.message }, 502);
  return json({ url: d.url });
}
