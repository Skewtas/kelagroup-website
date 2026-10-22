// KELA OS – projektmallar och skapande av projekt (manuellt eller automatiskt från accepterad offert).
import { Env, newId, now, addDays, today } from './core';

type Step = [title: string, dayOffset: number, milestone?: boolean];
export const PROJECT_TEMPLATES: Record<string, { name: string; days: number; steps: Step[] }> = {
  website: { name: 'Ny hemsida', days: 56, steps: [
    ['Kundmöte och behovsanalys', 3], ['Insamling av material', 10], ['Designförslag', 17], ['Kundens godkännande', 21, true],
    ['Utveckling', 35], ['SEO-konfiguration', 38], ['Testning', 42], ['Säkerhetskontroll', 44], ['Publicering', 46, true], ['Överlämning', 49], ['Uppföljning', 76],
  ] },
  booking: { name: 'Bokningssystem', days: 42, steps: [
    ['Behovsanalys och arbetsflöden', 3], ['Tjänster, priser och restid', 10], ['Koppling mot schemasystem/affärssystem', 18], ['Mejl- och sms-mallar', 21],
    ['Test tillsammans med kunden', 28, true], ['Utbildning av personal', 32], ['Lansering', 35, true], ['Uppföljning', 65],
  ] },
  ai_chat: { name: 'AI-chatt', days: 35, steps: [
    ['Insamling av kunskapsunderlag', 5], ['Koppling mot affärssystem', 12], ['Konfiguration och ton', 16], ['Intern testning', 20],
    ['Kundtest och godkännande', 25, true], ['Lansering', 28, true], ['Uppföljning efter 30 dagar', 58],
  ] },
  app: { name: 'App (personal-/kundapp)', days: 49, steps: [
    ['Behovsanalys', 3], ['Konfiguration och varumärke', 12], ['Integrationer', 21], ['Testning med pilotanvändare', 30, true],
    ['Publicering i App Store/Google Play', 38, true], ['Utbildning', 42], ['Uppföljning', 70],
  ] },
  general: { name: 'Generellt projekt', days: 30, steps: [
    ['Kickoff', 2], ['Genomförande', 20], ['Kundens godkännande', 25, true], ['Leverans', 28, true], ['Uppföljning', 45],
  ] },
};

/** Väljer mall utifrån offertens rader. */
export function pickTemplate(items: { name: string }[]): string {
  const text = items.map((i) => i.name).join(' ').toLowerCase();
  if (/hemsida|webbplats|webbsida/.test(text)) return 'website';
  if (/bokning|bokis/.test(text)) return 'booking';
  if (/chatt|chattis|chatbot/.test(text)) return 'ai_chat';
  if (/app\b|personalapp|kundapp/.test(text)) return 'app';
  return 'general';
}

/**
 * Skapar projekt + uppgifter från mall. Projektnumret räknas fram i samma transaktion.
 * Med quoteId används den unika index (org_id, quote_id) + source_key så att upprepade anrop inte skapar dubbletter.
 */
export function projectFromTemplateStmts(env: Env, orgId: string, p: {
  id: string; name: string; customerId: string; quoteId?: string | null; dealId?: string | null; ownerId?: string | null;
  templateKey: string; startDate?: string | null; dueDate?: string | null; budgetMinor?: number | null; estimatedHours?: number | null; description?: string | null; status?: string;
}) {
  const tpl = PROJECT_TEMPLATES[p.templateKey] || PROJECT_TEMPLATES.general;
  const t = now();
  const start = p.startDate || today();
  const due = p.dueDate || addDays(start, tpl.days).slice(0, 10);
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT OR IGNORE INTO projects (id, org_id, number, name, customer_id, quote_id, deal_id, owner_user_id, template_key, status, description, start_date, due_date, budget_minor, estimated_hours, created_at, updated_at)
      VALUES (?, ?, (SELECT COALESCE(MAX(number), 100) + 1 FROM projects WHERE org_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(p.id, orgId, orgId, p.name, p.customerId, p.quoteId ?? null, p.dealId ?? null, p.ownerId ?? null, p.templateKey, p.status || 'planned', p.description ?? null,
        start, due, p.budgetMinor ?? null, p.estimatedHours ?? null, t, t),
  ];
  // Uppgifternas deadlines skalas om projektets längd skiljer sig från mallens.
  const span = Math.max(1, (Date.parse(due) - Date.parse(start)) / 86400_000);
  const scale = span / tpl.days;
  tpl.steps.forEach(([title, off, milestone], i) => {
    const dueStep = addDays(start, Math.round(Math.min(off, tpl.days) * scale) + Math.max(0, off - tpl.days)).slice(0, 10);
    const key = p.quoteId ? `project:${p.quoteId}:${i}` : `project:${p.id}:${i}`;
    // Kopplas till projektet via quote_id om projektet redan fanns (idempotens), annars via id.
    stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO tasks (id, org_id, title, due_date, assignee_user_id, customer_id, quote_id, project_id, source_key, stage, milestone, sort, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, pr.id, ?, 'todo', ?, ?, ? FROM projects pr WHERE pr.org_id = ? AND ${p.quoteId ? 'pr.quote_id = ?' : 'pr.id = ?'}`)
      .bind(newId('tsk'), orgId, title, dueStep, p.ownerId ?? null, p.customerId, p.quoteId ?? null, key, milestone ? 1 : 0, i, t, orgId, p.quoteId ?? p.id));
  });
  return stmts;
}

export const PROJECT_STATUS = ['planned', 'active', 'waiting_customer', 'paused', 'done', 'cancelled'] as const;
