#!/usr/bin/env bash
# Versión web independiente (GitHub Pages + Supabase): mismo código que el Artifact,
# más el inicio de sesión de src/web/. Sale en web/index.html.
set -euo pipefail
cd "$(dirname "$0")"
SUPABASE_URL="https://eqwhiguptakmuuihpjpu.supabase.co"
SUPABASE_KEY="${GYM_SUPABASE_KEY:-$(cat src/web/supabase-publishable-key.txt)}"
mkdir -p web
{
  echo '<!doctype html>'
  echo '<html lang="es"><head>'
  echo '<meta charset="utf-8">'
  echo '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  echo '<title>Juan vs Ignacio</title>'
  echo '<meta name="description" content="Entrenos, pesos, copas y dieta de Juan e Ignacio con comparativa en directo.">'
  echo '<meta name="theme-color" content="#EEF0EC" media="(prefers-color-scheme: light)">'
  echo '<meta name="theme-color" content="#111315" media="(prefers-color-scheme: dark)">'
  echo '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2214%22 fill=%22%2315191C%22/%3E%3Crect x=%228%22 y=%2226%22 width=%228%22 height=%2212%22 rx=%222%22 fill=%22%232F5BD3%22/%3E%3Crect x=%2248%22 y=%2226%22 width=%228%22 height=%2212%22 rx=%222%22 fill=%22%23E0662A%22/%3E%3Crect x=%2216%22 y=%2230%22 width=%2232%22 height=%224%22 fill=%22%23fff%22/%3E%3C/svg%3E">'
  echo '<link rel="preconnect" href="https://fonts.googleapis.com">'
  echo '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800&family=Barlow:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap">'
  echo '<style>'; cat src/style.css src/web/web.css; echo '</style>'
  echo '</head><body class="locked">'
  cat src/body.html
  echo '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.0/dist/umd/supabase.js"></script>'
  echo "<script>window.GYM_WEB = { url: \"$SUPABASE_URL\", key: \"$SUPABASE_KEY\" };</script>"
  echo '<script>'; echo '(function(){'; echo '"use strict";'
  for f in $(ls src/[0-9]*.js | sort | grep -v 99-boot) src/web/08-web.js src/99-boot.js; do
    echo; echo "/* ===== $(basename "$f") ===== */"; cat "$f"
  done
  echo '})();'; echo '</script>'
  echo '</body></html>'
} > web/index.html
echo "web/index.html: $(wc -c < web/index.html) bytes"
