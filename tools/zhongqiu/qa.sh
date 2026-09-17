#!/bin/bash
# 中秋博饼活动 · 浏览器 QA
#
# 用法:
#   tools/zhongqiu/qa.sh scan            三档视口跑阶段扫描(溢出 + 位移)
#   tools/zhongqiu/qa.sh shift           三档视口跑位移审计
#   tools/zhongqiu/qa.sh shots [目录]     各阶段截图(默认 tools/zhongqiu/shots)
#   tools/zhongqiu/qa.sh copy            文案 ↔ 实现 对账(卡牌/Boss/页面规则文案)
#   URL=... SIZES="375x667" tools/zhongqiu/qa.sh scan
#
# 依赖: agent-browser、一个跑着的 dev server(默认 http://127.0.0.1:5173)
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$(dirname "$0")"
URL=${URL:-http://127.0.0.1:5173/zhongqiu}
SIZES=${SIZES:-"375x667 320x568 1280x800"}
CMD=${1:-scan}

ensure_browser() { command -v agent-browser >/dev/null || { echo "缺 agent-browser"; exit 1; }; }
ensure_server() {
  curl -s -o /dev/null "$URL" || { echo "dev server 没起来($URL)"; exit 1; }
}

run_in_page() { # $1=w $2=h $3=js 文件 $4=js 里要调用的函数名(可空)
  agent-browser set viewport "$1" "$2" 2 >/dev/null 2>&1
  agent-browser open "$URL" >/dev/null 2>&1
  sleep 2
  agent-browser eval --stdin < "$3" | python3 -c 'import sys,json;d=sys.stdin.read().strip()
try: print(json.loads(d))
except Exception: print(d)'
}

case "$CMD" in
  scan)  ensure_browser; ensure_server
         for s in $SIZES; do run_in_page "${s%x*}" "${s#*x}" qa/scan.js; echo; done ;;
  shift) ensure_browser; ensure_server
         for s in $SIZES; do run_in_page "${s%x*}" "${s#*x}" qa/shift.js; echo; done ;;
  copy)  cd "$ROOT" && bun run tools/zhongqiu/qa/copy.ts ;;
  shots) ensure_browser; ensure_server
         OUT=${2:-shots}; mkdir -p "$OUT"
         W=${SHOT_W:-375}; H=${SHOT_H:-667}
         agent-browser set viewport "$W" "$H" 2 >/dev/null 2>&1
         agent-browser open "$URL" >/dev/null 2>&1; sleep 2
         for spec in "idle:idle:{}" "draft:draft:{}" "intro:intro:{round:1}" "intro-boss:intro:{round:3,boss:\"miyue\"}" \
                     "rolling:rolling:{round:1}" "rolling-boss:rolling:{round:3,boss:\"shiyue\"}" \
                     "confirm:round_confirm:{round:1}" "round-end:round_end:{round:1}" \
                     "reward:reward:{round:1}" "shop:shop:{round:1}" "game-over:game_over:{round:7}"; do
           name=${spec%%:*}; rest=${spec#*:}; phase=${rest%%:*}; opts=${rest#*:}
           cat <<JS | agent-browser eval --stdin >/dev/null 2>&1
(async () => {
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  for (let i=0;i<200 && !window.__cheat;i++) await sleep(25);
  const C = window.__cheat;
  C.setTeam([null,'baiyutu','guihuagao','yupan','change','wugang']);
  C.mooncakes(60);
  C.addBuff('yuefu',2); C.addBuff('yulu',1); C.addBuff('manyuezhufu',3);
  C.jump('$phase', $opts);
  await sleep(80);
  return 'ok';
})()
JS
           agent-browser screenshot "$OUT/$name.png" >/dev/null 2>&1
           echo "  $OUT/$name.png"
         done ;;
  *) echo "用法: qa.sh [scan|shift|shots]"; exit 1 ;;
esac
