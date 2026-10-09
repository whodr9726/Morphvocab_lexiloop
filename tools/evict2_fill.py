# -*- coding: utf-8 -*-
"""踢出第二批（含今日队列内）+ 等量常用词回填。
判据同前：错≥3 且错多于对（无排除）。清理 revSnap/reviewedToday 引用（配额自动返还）。
回填：从未学段头部（A1 最常用优先）取与今日总踢出量等量的词，登记 added=今天 iv=1 ease=2.5 due=明天。
数组：踢出词归位未学段同档末尾；回填词挪入已学段尾，保持"前 newCursor 位=已学"不变式。
用法：python tools/evict2_fill.py --dry | --apply"""
import json, io, os, sys, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPLY = '--apply' in sys.argv
STATE = os.path.join(ROOT, 'webapp/data/state.json')
IELTS = os.path.join(ROOT, 'webapp/data/ielts.js')
TODAY, TOMORROW = '2026-10-04', '2026-10-05'

st = json.load(io.open(STATE, encoding='utf-8'))
prog = st['words']['progress']
CUR = st['words']['newCursor']
print('当前：progress', len(prog), '| newCursor', CUR, '| rev', st['rev'])

# 档位打分（归位用）
scores = {}
for n in range(15, 21):
    scores.update(json.load(io.open(os.path.join(ROOT, 'tools/v2_out', f'rank_{n:02d}.json'), encoding='utf-8')))

evict = [k for k, v in prog.items()
         if (v.get('wrong') or 0) >= 3 and (v.get('wrong') or 0) > (v.get('right') or 0)]
evict.sort(key=lambda k: -(prog[k]['wrong'] - prog[k]['right']))
print('第二批踢出词数:', len(evict))
print('头部:', [(k, prog[k]['wrong'], prog[k]['right']) for k in evict[:8]])
missing_tier = [k for k in evict if k not in scores]
if missing_tier:
    print('缺档位打分，中止:', missing_tier[:5]); sys.exit(1)
if len(evict) > int(len(prog) * 0.35):
    print('超过 35% 安全阀，中止'); sys.exit(1)

src = io.open(IELTS, encoding='utf-8').read()
head = src[:src.index('window.IELTS_WORDS')]
ws = json.loads(src[src.index('['):src.rindex(']') + 1])
assert len(ws) == 9388
learned = ws[:CUR]
unlearned = ws[CUR:]
ev_set = set(evict)
in_learned = [x['w'] for x in learned if x['w'] in ev_set]
print('其中位于已学段:', len(in_learned), '| 位于未学段(理论不该有):', len(evict) - len(in_learned))

# 回填量 = 今日两批踢出总量（第一批 103 + 本批），从 A1 头部取
FILL = 103 + len(evict)
fill_words = [x['w'] for x in unlearned[:FILL] if x['w'] not in ev_set and x['w'] not in prog]
fill_words = fill_words[:FILL]
print('回填常用词数:', len(fill_words), '| 头部样例:', fill_words[:8])
assert len(fill_words) == FILL, '回填取数不足'

if not APPLY:
    print('--- DRY 结束，未改任何文件 ---'); sys.exit(0)

# 1) 数组：已学段剔除踢出词；回填词从未学段头取出接到已学段尾；踢出词按档位插入未学段同档末尾
keep = [x for x in learned if x['w'] not in ev_set]
evicted_arr = [x for x in learned if x['w'] in ev_set]
fill_set = set(fill_words)
rest_unlearned = [x for x in unlearned if x['w'] not in fill_set]
tier_last = {}
for i, x in enumerate(rest_unlearned):
    t = scores.get(x['w'])
    if t: tier_last[t] = i
for t in reversed(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D']):
    ins = [x for x in evicted_arr if scores.get(x['w']) == t]
    if not ins: continue
    pos = tier_last.get(t, len(rest_unlearned) - 1)
    rest_unlearned = rest_unlearned[:pos + 1] + ins + rest_unlearned[pos + 1:]
    shift = len(ins)
    tier_last = {k: (v + shift if v > pos else v) for k, v in tier_last.items()}
    tier_last[t] = pos + shift
fill_arr = [x for x in unlearned if x['w'] in fill_set]
new_ws = keep + fill_arr + rest_unlearned
assert len(new_ws) == 9388
CUR_NEW = len(keep) + len(fill_arr)
assert CUR_NEW == 3139, f'已学池回填后应回 3139，实际 {CUR_NEW}'
assert set(x['w'] for x in new_ws[:CUR_NEW]) == (set(prog) - ev_set) | fill_set

# 2) 账本
new_prog = {k: v for k, v in prog.items() if k not in ev_set}
for k in fill_words:
    new_prog[k] = {'iv': 1, 'ease': 2.5, 'due': TOMORROW, 'wrong': 0, 'right': 0, 'streak': 0, 'added': TODAY}
st['words']['progress'] = new_prog
snap = st['words'].get('revSnap') or {}
if snap.get('keys'):
    snap['keys'] = [k for k in snap['keys'] if k not in ev_set]
    st['words']['revSnap'] = snap
rt = st['words'].get('reviewedToday') or []
rt2 = [k for k in rt if k not in ev_set]
if len(rt2) != len(rt): print(f'reviewedToday 清理: {len(rt)} -> {len(rt2)}（配额返还 {len(rt)-len(rt2)}）')
st['words']['reviewedToday'] = rt2
st['words']['newCursor'] = CUR_NEW
st['words']['todayNew'] = len(fill_words)   # 回填计入今日新学，明日 autoSettleNew 不再叠加
st['rev'] = st.get('rev', 0) + 100

# 3) 落盘（双备份）
shutil.copy(STATE, STATE + '.bak-preEvict2-20261004')
shutil.copy(IELTS, IELTS + '.bak-preEvict2-20261004')
io.open(STATE, 'w', encoding='utf-8').write(json.dumps(st, ensure_ascii=False))
io.open(IELTS, 'w', encoding='utf-8').write(
    head + 'window.IELTS_WORDS = ' + json.dumps(new_ws, ensure_ascii=False, separators=(',', ':')) + ';\n')
json.dump(sorted(evict), io.open(os.path.join(ROOT, 'tools/v2_out/evicted_words_2.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(f'已执行：第二批踢出 {len(evict)}、回填 {len(fill_words)}（due={TOMORROW}）、已学池 3139、newCursor {CUR_NEW}、rev {st["rev"]}')
print('今日剩余额度: 词', 750 - len(rt2), '| 明天队列 750 封顶自动摊开')
