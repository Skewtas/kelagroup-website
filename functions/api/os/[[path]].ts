// KELA OS – adminpanelens API. All behörighetskontroll sker på servern (se functions/_lib/router.ts).
import type { Env } from '../../_lib/core';
import { Router } from '../../_lib/router';
import { authRoutes } from '../../_lib/routes/auth';
import { crmRoutes } from '../../_lib/routes/crm';
import { serviceRoutes } from '../../_lib/routes/services';
import { quoteRoutes } from '../../_lib/routes/quotes';
import { adminRoutes } from '../../_lib/routes/admin';
import { projectRoutes } from '../../_lib/routes/projects';

const router = new Router();
authRoutes(router);
crmRoutes(router);
serviceRoutes(router);
quoteRoutes(router);
adminRoutes(router);
projectRoutes(router);

export const onRequest: PagesFunction<Env> = ({ request, env }) => router.handle(request, env, '/api/os');
