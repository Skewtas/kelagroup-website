"""Uppdaterar meny, mobilmeny och sidfot på alla publika sidor + bygger sitemap.xml.

Körs från repots rot:  python3 scripts/site_chrome.py
Säker att köra flera gånger.
"""
import datetime, glob, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SKIP_DIRS = ("nya-hemsidan/", "os/", "badge/", "assets/", "node_modules/", "tests/", "docs/", "functions/", "scripts/", "db/")
PAGES = sorted(p for p in glob.glob("**/*.html", recursive=True) if not p.startswith(SKIP_DIRS))

ICON = '<span class="ico" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{}</svg></span>'
MEGA_EXTRA = (
    '\n            <a class="mega-card" href="/geo-optimering">' + ICON.format('<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>')
    + '<span><b><i>06</i>GEO – synas i AI-sök</b><span>Bli källan som ChatGPT och Google AI citerar.</span></span></a>'
    '\n            <a class="mega-card" href="/sokmotoroptimering">' + ICON.format('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>')
    + '<span><b><i>07</i>Sökmotoroptimering</b><span>Fler besökare från Google – lokalt och nationellt.</span></span></a>'
)
FOOT_BUILD = ('<div class="f-col"><h3>Vad vi bygger</h3><a href="/bygga-hemsida">Hemsidor</a><a href="/bygga-system">System</a>'
              '<a href="/bygga-automationer">Automation</a><a href="/ai-agenter">AI</a><a href="/bygga-app">Appar</a>'
              '<a href="/sokmotoroptimering">SEO</a><a href="/geo-optimering">GEO &amp; AI-sök</a><a href="/marknadsforing">Marknadsföring</a></div>')
FOOT_CO = ('<div class="f-col"><h3>Företaget</h3><a href="/produkter">Produkter</a><a href="/integrationer">Integrationer</a>'
           '<a href="/case">Case</a><a href="/priskalkylator">Få en offert</a><a href="/om-oss">Om oss</a><a href="/blogg">Blogg</a>'
           '<a href="/vanliga-fragor">Vanliga frågor</a><a href="/webbyra-stockholm">Webbyrå Stockholm</a></div>')
FOOT_BOT = ('<div class="f-bot"><span>© 2026 Kela group AB — Org.nr 559578-1971</span>'
            '<span><a href="/integritetspolicy">Integritetspolicy</a> · <a href="/cookies">Cookies</a></span>'
            '<span class="mono">Stockholm · hela Europa</span></div>')


def update(s):
    # Mega-meny: lägg till GEO + SEO efter Mobilappar-kortet
    if 'href="/geo-optimering"><span class="ico"' not in s:
        s = re.sub(r'(<a class="mega-card" href="/bygga-app">.*?</a>)', lambda m: m.group(1) + MEGA_EXTRA, s, count=1, flags=re.S)
    # Toppmeny: Produkter före Case
    if '<a href="/produkter">Produkter</a>\n      <a href="/case">Case</a>' not in s:
        s = s.replace('      <a href="/case">Case</a>\n      <a href="/kontakt">Kontakt</a>',
                      '      <a href="/produkter">Produkter</a>\n      <a href="/case">Case</a>\n      <a href="/kontakt">Kontakt</a>', 1)
    # Mobilmeny
    s = s.replace('<a href="/bygga-app">Mobilappar</a>\n    </div>',
                  '<a href="/bygga-app">Mobilappar</a><a href="/geo-optimering">GEO – AI-sök</a><a href="/sokmotoroptimering">SEO</a><a href="/marknadsforing">Marknadsföring</a>\n    </div>', 1)
    if '<li><a href="/produkter">Produkter</a></li>' not in s:
        s = s.replace('      <li><a href="/case">Case</a></li>', '      <li><a href="/produkter">Produkter</a></li>\n      <li><a href="/case">Case</a></li>', 1)
    # Sidfot
    s = re.sub(r'<div class="f-col"><h3>Vad vi bygger</h3>.*?</div>', FOOT_BUILD, s, count=1, flags=re.S)
    s = re.sub(r'<div class="f-col"><h3>Företaget</h3>.*?</div>', FOOT_CO, s, count=1, flags=re.S)
    s = re.sub(r'<div class="f-bot">.*?</div>', FOOT_BOT, s, count=1, flags=re.S)
    return s


def url_for(p):
    if p == "index.html":
        return "https://kelagroup.se/"
    return "https://kelagroup.se/" + p[:-5]


def priority(p):
    if p == "index.html": return "1.0"
    if p in ("geo-optimering.html", "sokmotoroptimering.html", "bygga-hemsida.html", "bygga-system.html",
             "bygga-automationer.html", "produkter.html", "stadbolag.html", "bransch-stad.html"): return "0.9"
    if p.startswith(("blogg/",)) or p in ("integritetspolicy.html", "cookies.html", "blogg.html"): return "0.5"
    return "0.8" if p.startswith("produkter/") or p.startswith("bransch-") else "0.7"


changed, entries = 0, []
today = datetime.date.today().isoformat()
for p in PAGES:
    s = open(p, encoding="utf-8").read()
    s2 = update(s)
    if s2 != s:
        open(p, "w", encoding="utf-8").write(s2)
        changed += 1
    if re.search(r'name="robots" content="noindex', s2):
        continue
    entries.append(f'  <url><loc>{url_for(p)}</loc><lastmod>{today}</lastmod><priority>{priority(p)}</priority></url>')

open("sitemap.xml", "w", encoding="utf-8").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + "\n".join(entries) + "\n</urlset>\n")
print(f"{changed} sidor uppdaterade, {len(entries)} adresser i sitemap.xml")
