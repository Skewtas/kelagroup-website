// Spårning för offertsidor under /s/<slug>/ (besök, lästid, scroll, val) och svar i checklistor.
import type { Env } from '../../_lib/core';
import { handleTrackingApi } from '../../_lib/tracking';
import { handleChecklistApi } from '../../_lib/checklist';

export const onRequest: PagesFunction<Env> = ({ request, env, params }) => {
  const parts = ([] as string[]).concat(params.path || []);
  if (parts.length === 2 && parts[1] === 'answers') return handleChecklistApi(env, request, parts[0]);
  return handleTrackingApi(env, request, parts);
};
