// Utgående e-post från KELA OS via Resend (https://resend.com). Används för systemmejl, t.ex. "Glömt lösenord".
// Kräver RESEND_API_KEY och en verifierad avsändardomän (MAIL_FROM, standard noreply@kelagroup.se).
// Lokalt utan nyckel skrivs mejlet bara ut i serverloggen.
import type { Env } from './core';

export interface Mail { to: string; subject: string; text: string; html?: string }

export async function sendMail(env: Env, m: Mail): Promise<boolean> {
  const from = env.MAIL_FROM || 'KELA OS <noreply@kelagroup.se>';
  if (!env.RESEND_API_KEY) {
    if (env.OS_ENV === 'development') {
      console.log(`[e-post, ej skickad – RESEND_API_KEY saknas]\nTill: ${m.to}\nÄmne: ${m.subject}\n\n${m.text}`);
      return true;
    }
    console.error('RESEND_API_KEY saknas – e-post kunde inte skickas.');
    return false;
  }
  try {
    const res = await fetch(env.MAIL_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.error('E-post misslyckades', res.status, (await res.text()).slice(0, 300)); return false; }
    return true;
  } catch (e) {
    console.error('E-post misslyckades', e);
    return false;
  }
}
