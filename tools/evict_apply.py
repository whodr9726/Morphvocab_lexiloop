# -*- coding: utf-8 -*-
"""已学池瘦身（用户定稿判据）：把「频繁出错」词（🔴 错≥3 且错多于对，与页面标签同款）标回未学。
用法：python tools/evict_apply.py --dry   （只测算，不动任何文件）
      python tools/evict_apply.py --apply （真实执行：备份 state.json + ielts.js，rev+100）
归位：踢出词按 rank 打分档位插到未学段同档位末尾（打分来自 rank_15~20）。
排除：今日已答（reviewedToday）、今日复习快照（revSnap）内的词明天再踢。
安全阀：踢出量 > 已学 35% 时中止待人工复核。
执行：① 从 words.progress 删除 ② 数组把踢出词从已学段挪到未学段同档位末尾 ③ newCursor=剩余已学段长度。"""
import json, io, os, sys, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPLY = '--apply' in sys.argv
DRY = not APPLY
STATE = os.path.join(ROOT, 'webapp/data/state.json')
IELTS = os.path.join(ROOT, 'webapp/data/ielts.js')
CUR_OLD = 3139

st = json.load(io.open(STATE, encoding='utf-8'))
prog = st['words']['progress']
revToday = set(st['words'].get('reviewedToday') or [])
snap = set((st['words'].get('revSnap') or {}).get('keys') or [])
print('账本已学(progress):', len(prog), '| 今日已答:', len(revToday), '| 今日快照:', len(snap))

evict = [k for k, v in prog.items()
         if (v.get('wrong') or 0) >= 3
         and (v.get('wrong') or 0) > (v.get('right') or 0)
         and k not in revToday and k not in snap]
evict.sort(key=lambda k: -(prog[k]['wrong'] - prog[k]['right']))
if len(evict) > int(len(prog) * 0.35):
    print(f'踢出量 {len(evict)} 超过 35% 安全阀，中止待人工复核'); sys.exit(1)
print(f'频繁出错踢出词数={len(evict)}')
print('头部:', [(k, prog[k]['wrong'], prog[k]['right']) for k in evict[:10]])

# 归位用的档位打分（已学段 rank_15~20）
scores = {}
missing_scores = []
for n in range(15, 21):
    p = os.path.join(ROOT, 'tools/v2_out', f'rank_{n:02d}.json')
    if os.path.exists(p):
        scores.update(json.load(io.open(p, encoding='utf-8')))
for k in evict:
    if k not in scores: missing_scores.append(k)
if missing_scores:
    print('缺打分（未跑完 rank_15~20，无法归位）:', len(missing_scores), missing_scores[:5]); sys.exit(1)

if DRY:
    from collections import Counter
    print('归位档位分布:', dict(Counter(scores.get(k) for k in evict)))
    print('--- DRY 模式结束，未改任何文件 ---'); sys.exit(0)

# 2) 数组重排：踢出词挪到未学段同档位末尾
src = io.open(IELTS, encoding='utf-8').read()
head = src[:src.index('window.IELTS_WORDS')]
ws = json.loads(src[src.index('['):src.rindex(']') + 1])
assert len(ws) == 9388
learned_arr = [x for x in ws[:CUR_OLD] if x['w'] not in set(evict)]
evicted_arr = [x for x in ws[:CUR_OLD] if x['w'] in set(evict)]
unlearned = ws[CUR_OLD:]
# 未学段各档位末位索引
tier_last = {}
for i, x in enumerate(unlearned):
    t = scores.get(x['w'])
    if t: tier_last[t] = i
for t in reversed(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D']):
    ins = [x for x in evicted_arr if scores.get(x['w']) == t]
    if not ins: continue
    pos = tier_last.get(t)
    if pos is None:
        pos = len(unlearned) - 1  # 该档不在未学段（不该发生），垫底
    unlearned = unlearned[:pos + 1] + ins + unlearned[pos + 1:]
    # 后续档位末位索引整体后移
    shift = len(ins)
    tier_last = {k: (v + shift if v > pos else v) for k, v in tier_last.items()}
    tier_last[t] = pos + shift
new_ws = learned_arr + unlearned
assert len(new_ws) == 9388
CUR_NEW = len(learned_arr)
kept_keys = set(x['w'] for x in learned_arr)
new_prog = {k: v for k, v in prog.items() if k not in set(evict)}
assert kept_keys == set(new_prog.keys()), '已学段与剩余进度不一致'
assert all(x['w'] not in set(evict) for x in new_ws[:CUR_NEW])
print(f'数组重排完成：已学段 {CUR_OLD} -> {CUR_NEW}，未学段插入 {len(evicted_arr)} 词到同档位')

# 3) 写账本（rev+100）与词书
shutil.copy(STATE, STATE + '.bak-preEvict-20261004')
shutil.copy(IELTS, IELTS + '.bak-preEvict-20261004')
st['words']['progress'] = new_prog
st['words']['newCursor'] = CUR_NEW
st['rev'] = (st.get('rev') or 0) + 100
io.open(STATE, 'w', encoding='utf-8').write(json.dumps(st, ensure_ascii=False))
out = head + 'window.IELTS_WORDS = ' + json.dumps(new_ws, ensure_ascii=False, separators=(',', ':')) + ';\n'
io.open(IELTS, 'w', encoding='utf-8').write(out)
json.dump(sorted(evict), io.open(os.path.join(ROOT, 'tools/v2_out/evicted_words.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(f'已执行：删 {len(evict)} 词进度、newCursor={CUR_NEW}、rev={st["rev"]}（用户刷新后生效）；备份 state/ielts .bak-preEvict-20261004')
