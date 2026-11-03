// Spårning för offertsidor under /s/<slug>/ (besök, lästid, scroll, val).
import type { Env } from '../../_lib/core';
import { handleTrackingApi } from '../../_lib/tracking';

export const onRequest: PagesFunction<Env> = ({ request, env, params }) =>
  handleTrackingApi(env, request, ([] as string[]).concat(params.path || []));
