// Pages laddar upp hela mappen som statiska filer. Den här routen ser till att serverkällkoden
// under /functions/ aldrig serveras publikt.
export const onRequest: PagesFunction = () => new Response('Hittades inte', { status: 404, headers: { 'cache-control': 'no-store' } });
