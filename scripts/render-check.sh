#!/usr/bin/env bash
# Draws the 3D for real and saves pictures, so the look can be checked by eye (or by Claude,
# which reads the PNGs). Used where the three.js CDN cannot be reached: three.js r170 (the
# version index.html loads) is fetched once from GitHub into .cache/three.
#
#   bash scripts/render-check.sh            → pictures in .cache/shots/
#
# Needs git, python3 and Chrome/Chromium (set CHROME=... if it is not on the PATH).
# Display only: nothing here changes the app or its numbers.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
OUT="$ROOT/.cache/shots"
PORT="${PORT:-8099}"
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)}"
[ -n "$CHROME" ] || { echo "Chrome が見つかりません（CHROME=... で指定）"; exit 1; }
mkdir -p "$OUT"

# 1. three.js r170, only the files the app uses.
if [ ! -f .cache/three/build/three.module.js ]; then
  git clone -q --depth 1 --filter=blob:none --sparse --branch r170 https://github.com/mrdoob/three.js .cache/three
  git -C .cache/three sparse-checkout set build examples/jsm/controls examples/jsm/geometries
fi

# 2. A copy of index.html (.preview.html, beside it so the relative paths hold) that reads that three.js, and keeps the WebGL picture for screenshots.
#    `months` and `goal` in the URL set the slider and open a goal's help scene.
sed -e 's#https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js#./.cache/three/build/three.module.js#' \
    -e 's#https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/#./.cache/three/examples/jsm/#' \
    -e 's#<head>#<head><script>const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,a){if(t\&\&t.startsWith("webgl"))a={...(a||{}),preserveDrawingBuffer:true};return g.call(this,t,a)};</script>#' \
    -e 's#</body>#<script>const q=new URLSearchParams(location.search);setTimeout(()=>{const m=q.get("months");if(m){const s=document.querySelector("\#months");s.value=m;s.dispatchEvent(new Event("input",{bubbles:true}));s.dispatchEvent(new Event("change",{bubbles:true}));}const r=q.get("area");if(r)setTimeout(()=>document.querySelector(`\#adjust-rooms button[data-room="${r}"]`)?.click(),400);const g=q.get("goal");if(g)setTimeout(()=>document.querySelector(`li[data-goal="${g}"]`)?.click(),800);},2500);</script></body>#' \
    index.html > .preview.html

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1

shot() { # url file width height wait-ms
  timeout 90 "$CHROME" --headless=new --no-sandbox --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
    --run-all-compositor-stages-before-draw --hide-scrollbars --window-size="$3,$4" \
    --virtual-time-budget="$5" --screenshot="$OUT/$2" "http://127.0.0.1:$PORT/$1" >/dev/null 2>&1 || echo "  （打ち切り：$2）"
  echo "  $OUT/$2"
}

echo "あーちゃんの図形："
shot "scripts/figure-preview.html" figure-ages.png 1200 520 4000
shot "scripts/figure-preview.html?arms=2.98" figure-reach.png 1200 520 4000
shot "scripts/figure-preview.html?turns=1.4,-1.0,2.2&look=1" figure-look.png 1200 520 4000
shot "scripts/figure-preview.html?months=9,12,15&crawl=1&turns=1.2,1.2,1.2&look=1" figure-crawl.png 1200 520 4000
echo "アプリ全体："
shot ".preview.html?months=15" app-15.png 1400 860 15000
shot ".preview.html?months=60" app-60.png 1400 860 15000
shot ".preview.html?months=15&area=washroom" app-15-washroom.png 1400 860 15000
shot ".preview.html?months=36&area=kitchen" app-36-kitchen.png 1400 860 15000
echo "助けの場面（電気をつける）："
shot ".preview.html?months=15&goal=switch" help-switch-15.png 1400 860 16000
shot ".preview.html?months=30&goal=switch" help-switch-30.png 1400 860 16000
