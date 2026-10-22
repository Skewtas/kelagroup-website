// Publika åtgärder på en delad offert: registrera visning, godkänna, avböja.
import type { Env } from '../../_lib/core';
import { handlePublicQuoteApi } from '../../_lib/public-quote';

export const onRequest: PagesFunction<Env> = ({ request, env, params }) =>
  handlePublicQuoteApi(env, request, ([] as string[]).concat(params.path || []));
