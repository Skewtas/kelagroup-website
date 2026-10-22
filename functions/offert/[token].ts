// Kundens offert via säker personlig länk: kelagroup.se/offert/<token>
import type { Env } from '../_lib/core';
import { renderPublicQuote } from '../_lib/public-quote';

export const onRequestGet: PagesFunction<Env> = ({ request, env, params }) => renderPublicQuote(env, request, String(params.token));
