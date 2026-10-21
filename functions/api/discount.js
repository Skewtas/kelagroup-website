// Cloudflare Pages Function — kontrollerar rabattkoder i priskalkylatorn.
// Koderna ligger här på servern (inte i sidans kod) så att de inte syns för alla.
// Ändra/lägg till koder: sätt miljövariabeln DISCOUNT_CODES i Cloudflare,
// t.ex. "KELA10:10,VÅR25:25" (kod:procent). Annars gäller standardlistan nedan.

const DEFAULT_CODES = "KELA10:10";

export function discountFor(code, env) {
  const list = String((env && env.DISCOUNT_CODES) || DEFAULT_CODES);
  const wanted = String(code || "").trim().toUpperCase();
  if (!wanted) return 0;
  for (const part of list.split(",")) {
    const [k, pct] = part.split(":").map((x) => x.trim());
    const n = Number(pct);
    if (k && k.toUpperCase() === wanted && n > 0 && n < 100) return n / 100;
  }
  return 0;
}

export async function onRequestPost({ request, env }) {
  let code = "";
  try { code = (await request.json()).code; } catch (e) {}
  const d = discountFor(code, env);
  return new Response(JSON.stringify(d ? { valid: true, code: String(code).trim().toUpperCase(), percent: Math.round(d * 100) } : { valid: false }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
