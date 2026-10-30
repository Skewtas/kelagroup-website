// KELA AI – publikt API för AI-assistenten på hemsidan. Logiken finns i functions/_lib/kela-ai/.
import type { Env } from '../../_lib/core';
import { handleAi } from '../../_lib/kela-ai/api';

export const onRequest: PagesFunction<Env> = ({ request, env, waitUntil }) => handleAi(request, env, (p) => waitUntil(p));
