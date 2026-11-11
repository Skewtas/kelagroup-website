// Körs av deploy.sh på kopian som publiceras (aldrig på källkoden).
// Lägger till ?v=<version> på alla adresser till KELA OS egna JS- och CSS-filer, så att webbläsaren alltid
// hämtar den nya versionen efter en publicering. Behövs eftersom Cloudflare låter webbläsaren spara
// .js/.css i 4 timmar oavsett våra egna cache-headers.
//   node scripts/version-assets.mjs <publiceringsmapp> <version>
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [dir, version] = process.argv.slice(2);
if (!dir || !version) { console.error('Användning: node scripts/version-assets.mjs <mapp> <version>'); process.exit(1); }
const os = join(dir, 'os');
const v = encodeURIComponent(version);
let files = 0, refs = 0;

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const file of walk(os)) {
  if (!/\.(js|html)$/.test(file)) continue;
  const src = readFileSync(file, 'utf8');
  // Relativa importer: from './x.js', import('../x.js')
  let out = src.replace(/((?:\bfrom\s*|\bimport\s*\(\s*)(['"]))(\.{1,2}\/[^'"?]+\.js)\2/g, (_m, pre, q, path) => { refs++; return `${pre}${path}?v=${v}${q}`; });
  // index.html: /os/app.js och /os/app.css
  out = out.replace(/((?:src|href)=")(\/os\/[^"?]+\.(?:js|css))"/g, (_m, pre, path) => { refs++; return `${pre}${path}?v=${v}"`; });
  if (out !== src) { writeFileSync(file, out); files++; }
}
console.log(`Versionerade ${refs} adresser i ${files} filer (v=${version})`);
