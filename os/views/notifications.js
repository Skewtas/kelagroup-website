// Notiser – händelser från kunder och hemsidan (öppnade/accepterade offerter, nya förfrågningar).
import { html, ico, setHTML, ago, empty } from '../lib/ui.js';
import { get } from '../lib/api.js';

export default async function notifications(view, _p, app) {
  app.setCrumbs([{ label: 'Notiser' }]);
  const r = await get('/notifications');
  const link = (a) => a.quote_id ? `#/offerter/${a.quote_id}` : a.lead_id ? `#/leads/${a.lead_id}` : a.customer_id ? `#/kunder/${a.customer_id}` : '#/';
  const ic = (t) => /accepter/i.test(t) ? ['checkCircle', 'green'] : /öppnats/i.test(t) ? ['eye', 'blue'] : /avböj/i.test(t) ? ['xCircle', 'red'] : /förfrågan/i.test(t) ? ['inbox', 'accent'] : ['bell', ''];
  setHTML(view, html`<div class="page-h"><div><h1>Notiser</h1><div class="sub">Det som hänt utan att någon i teamet gjort det – kunder och hemsidan</div></div></div>
    <div class="card">${r.notifications.length ? html`<div class="list">${r.notifications.map((a) => { const [i, c] = ic(a.title); return html`<a class="li" href="${link(a)}"><span class="li-ico ${c}">${ico(i)}</span>
      <span class="li-b"><div class="li-t">${a.title}</div><div class="li-s">${a.customer_name || ''}</div></span><span class="li-r">${ago(a.created_at)}</span></a>`; })}</div>`
      : empty({ icon: 'bell', title: 'Inga notiser ännu', text: 'Här ser du när kunder öppnar, accepterar eller avböjer offerter och när nya förfrågningar kommer in. Push- och mejlnotiser kopplas in i en senare fas.' })}</div>`);
}
