#!/usr/bin/env bash
# Junta src/ en un único index.html (el formato que publica el visor de Artifacts de Claude).
set -euo pipefail
cd "$(dirname "$0")"
{
  echo '<title>Las cuentas de Juan</title>'
  echo '<meta name="description" content="Gastos, ingresos, cuentas, deudas, objetivos y previsión año a año hasta 2040, con escáner de tickets que reparte cada gasto en su categoría.">'
  echo '<link rel="preconnect" href="https://fonts.googleapis.com">'
  echo '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap">'
  echo '<style>'; cat src/style.css; echo '</style>'
  cat src/body.html
  echo '<script>'; echo '(function(){'; echo '"use strict";'
  for f in $(ls src/[0-9]*.js | sort); do echo; echo "/* ===== $(basename "$f") ===== */"; cat "$f"; done
  echo '})();'; echo '</script>'
} > index.html
echo "index.html: $(wc -c < index.html) bytes"
