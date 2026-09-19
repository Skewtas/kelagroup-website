# Kela group AB — webbplats

Statisk webbplats (HTML/CSS/JS) för Kela group AB. 17 sidor, delad `assets/styles.css` + `assets/main.js`, självhostad Archivo Black-font och komprimerad video-hero.

## Kör lokalt
```bash
python3 -m http.server 4321
```
Öppna sedan http://localhost:4321

## Struktur
- `index.html` + 16 undersidor (tjänster, pelarsidor, priser, case, kundcase Stodona, kontakt m.m.)
- `assets/` — `styles.css`, `main.js`, `fonts/`, `hero.mp4`
- `sitemap.xml`, `robots.txt`

## Publicering
Sajten hostas på **Cloudflare Pages** och nås via **kelagroup.se**.
Vid ändring av `styles.css`/`main.js`: höj versionen (`?v=N`) i alla `.html` (cache-busting).

## Att göra före/efter lansering
- Sätt Formspree-endpoint i `kontakt.html` (formuläret skickar till mikaela.wigert@stodona.se)
- Fyll i org.nr i footern (platshållare `55XX-XXXX`)
- Verifiera priser och ev. case-detaljer
