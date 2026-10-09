# -*- coding: utf-8 -*-
"""常用度重排合并：v2_out/rank_01~14 → 重排 ielts.js 的 index>=3139 段（已学前 3139 词逐字节不动）
不变量：总词数 9388、前 3139 词原序原样、全库词集合不变、state.json 进度键全在词书内。跑前备份。"""
import json, io, os, sys, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IELTS = os.path.join(ROOT, 'webapp/data/ielts.js')
CUR = 3139
TIERS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D']

src = io.open(IELTS, encoding='utf-8').read()
head = src[:src.index('window.IELTS_WORDS')]
ws = json.loads(src[src.index('['):src.rindex(']') + 1])
assert len(ws) == 9388, f'词数异常 {len(ws)}'
before_keys = [x['w'] for x in ws]
learned = ws[:CUR]                      # 已学段：逐字节不动
tail = ws[CUR:]

scores = {}
for n in range(1, 15):
    p = os.path.join(ROOT, 'tools/v2_out', f'rank_{n:02d}.json')
    if not os.path.exists(p):
        print('缺输出:', p); sys.exit(1)
    scores.update(json.load(io.open(p, encoding='utf-8')))
print('打分词数:', len(scores))

missing = [x['w'] for x in tail if x['w'] not in scores]
if missing:
    print('未打分词:', len(missing), missing[:5]); sys.exit(1)

# 稳定排序：档位升序，同档保持库内原相对顺序
order = {t: i for i, t in enumerate(TIERS)}
ranked = sorted(tail, key=lambda x: order[scores[x['w']]])
new_ws = learned + ranked

after_keys = [x['w'] for x in new_ws]
assert len(new_ws) == 9388
assert after_keys[:CUR] == before_keys[:CUR], '已学段被改动！'
assert set(after_keys) == set(before_keys), '词集合改变！'

# 进度键无损验证
st = json.load(io.open(os.path.join(ROOT, 'webapp/data/state.json'), encoding='utf-8'))
book_set = set(after_keys)
lost = [k for k in st['words']['progress'] if k not in book_set]
lost_p = [k for k in st['phrases']['progress'] if False]
if lost:
    print('进度键丢失:', lost[:10]); sys.exit(1)
print('进度键校验: words', len(st['words']['progress']), '全在词书 ✓')

from collections import Counter
dist = Counter(scores[x['w']] for x in tail)
print('档位分布:', dict(dist))
print('新序头 15 词:', [x['w'] for x in ranked[:15]])
print('新序尾 10 词:', [x['w'] for x in ranked[-10:]])

shutil.copy(IELTS, IELTS + '.bak-preRank-20261003')
out = head + 'window.IELTS_WORDS = ' + json.dumps(new_ws, ensure_ascii=False, separators=(',', ':')) + ';\n'
io.open(IELTS, 'w', encoding='utf-8').write(out)
print('已重排写入 ielts.js（前 3139 不变）；备份 ielts.js.bak-preRank-20261003')
