#!/usr/bin/env bash
# Junta src/ en un único index.html (el formato que publica el visor de Artifacts).
set -euo pipefail
cd "$(dirname "$0")"
{
  echo '<title>Juan vs Ignacio</title>'
  echo '<meta name="description" content="Entrenos, pesos, copas y dieta de Juan e Ignacio con comparativa en directo.">'
  echo '<link rel="preconnect" href="https://fonts.googleapis.com">'
  echo '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800&family=Barlow:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap">'
  echo '<style>'; cat src/style.css; echo '</style>'
  cat src/body.html
  echo '<script>'; echo '(function(){'; echo '"use strict";'
  for f in $(ls src/[0-9]*.js | sort); do echo; echo "/* ===== $(basename "$f") ===== */"; cat "$f"; done
  echo '})();'; echo '</script>'
} > index.html
echo "index.html: $(wc -c < index.html) bytes"
