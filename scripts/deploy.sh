#!/usr/bin/env bash
# Publicerar kelagroup.se + KELA OS till Cloudflare Pages från senaste commit (HEAD).
# Okomitterade filer, .dev.vars, testdata och utvecklingsfiler följer aldrig med.
#
# Användning:  bash scripts/deploy.sh            (publicera)
#              bash scripts/deploy.sh --migrate  (kör databasmigreringar först)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain -- functions os _headers robots.txt db)" ]]; then
  echo "⚠  Det finns okomitterade ändringar i KELA OS-filer. Committa först – endast HEAD publiceras."
  exit 1
fi

if [[ "${1:-}" == "--migrate" ]]; then
  echo "→ Kör databasmigreringar mot produktionsdatabasen (kela-os)…"
  npx wrangler@4 d1 migrations apply kela-os --remote --config db/wrangler.toml
fi

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
git archive HEAD | tar -x -C "$OUT"
# Utvecklingsfiler som inte ska ligga publikt (functions/ byggs av wrangler och laddas inte upp som filer).
rm -rf "$OUT"/{db,tests,docs,scripts,badge,nya-hemsidan,.claude} "$OUT"/package.json "$OUT"/package-lock.json "$OUT"/tsconfig.json "$OUT"/badge-preview.png 2>/dev/null || true

echo "→ Publicerar till Cloudflare Pages (kelagroup-website, main)…"
cd "$OUT"
npx wrangler@4 pages deploy . --project-name kelagroup-website --branch main --commit-dirty=true
