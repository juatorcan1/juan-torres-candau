#!/usr/bin/env bash
# Versión web independiente (GitHub Pages + Supabase): mismo código que el Artifact,
# más la entrada con contraseña de src/web/. Sale en web/index.html.
set -euo pipefail
cd "$(dirname "$0")"
SUPABASE_URL="https://eqwhiguptakmuuihpjpu.supabase.co"
# La clave publicable (la que puede ir en una web) es la misma del gimnasio.
SUPABASE_KEY="${CJ_SUPABASE_KEY:-$(cat ../gym-app/src/web/supabase-publishable-key.txt)}"
mkdir -p web
{
  echo '<!doctype html>'
  echo '<html lang="es"><head>'
  echo '<meta charset="utf-8">'
  echo '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  echo '<meta name="robots" content="noindex, nofollow">'
  echo '<title>Las cuentas de Juan</title>'
  echo '<meta name="description" content="Gastos, ingresos, cuentas, deudas, objetivos y previsión año a año hasta 2040.">'
  echo '<meta name="theme-color" content="#EEF1F4" media="(prefers-color-scheme: light)">'
  echo '<meta name="theme-color" content="#101317" media="(prefers-color-scheme: dark)">'
  # Para instalarla en el móvil como una aplicación: la ficha (manifest) y los iconos.
  echo '<link rel="manifest" href="manifest.json">'
  echo '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">'
  echo '<meta name="mobile-web-app-capable" content="yes">'
  echo '<meta name="apple-mobile-web-app-capable" content="yes">'
  echo '<meta name="apple-mobile-web-app-title" content="Mis cuentas">'
  echo '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2214%22 fill=%22%231C2F75%22/%3E%3Cpath d=%22M14 22a4 4 0 0 1 4-4h26v8M14 22v22a4 4 0 0 0 4 4h30V26H18a4 4 0 0 1-4-4z%22 fill=%22none%22 stroke=%22%23fff%22 stroke-width=%224%22 stroke-linejoin=%22round%22/%3E%3Ccircle cx=%2240%22 cy=%2237%22 r=%223%22 fill=%22%23fff%22/%3E%3C/svg%3E">'
  echo '<link rel="preconnect" href="https://fonts.googleapis.com">'
  echo '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap">'
  echo '<style>'; cat src/style.css src/web/web.css; echo '</style>'
  echo '</head><body class="locked">'
  cat src/body.html
  echo '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.0/dist/umd/supabase.js"></script>'
  echo "<script>window.CJ_WEB = { url: \"$SUPABASE_URL\", key: \"$SUPABASE_KEY\" };</script>"
  echo '<script>'; echo '(function(){'; echo '"use strict";'
  for f in $(ls src/[0-9]*.js | sort | grep -v 99-boot) src/web/09-web.js src/99-boot.js; do
    echo; echo "/* ===== $(basename "$f") ===== */"; cat "$f"
  done
  echo '})();'; echo '</script>'
  echo '</body></html>'
} > web/index.html
cp src/web/manifest.json web/manifest.json
mkdir -p web/icons && cp src/web/icons/*.png web/icons/
echo "web/index.html: $(wc -c < web/index.html) bytes"
