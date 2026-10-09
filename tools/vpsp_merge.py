# -*- coding: utf-8 -*-
"""介词动词拆分合并：v2_out/vpsp_01~03 → ielts.js / vp_map.js / chunk_map.js / state.json
变换：① 混合母词（01/02）m 替换为去 vp 义 ② 纯母词（03，9 词）整词删除+其进度清理
③ 新词条（"母词 介词"）按 tier 插入未学段同档末尾 ④ vp_map 删全部 122 个母词条目
⑤ chunk_map 加新词条拆块、删已消失母词条目。不变量全断言。跑前四备份。"""
import json, io, os, sys, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, *p)

res = {}
for n in (1, 2, 3):
    p = D('tools/v2_out', f'vpsp_{n:02d}.json')
    if not os.path.exists(p):
        print('缺输出:', p); sys.exit(1)
    res.update(json.load(io.open(p, encoding='utf-8')))
print('拆分结果母词:', len(res))

# 未学段档位（rank_01~14）
scores = {}
for n in range(1, 15):
    scores.update(json.load(io.open(D('tools/v2_out', f'rank_{n:02d}.json'), encoding='utf-8')))

# ① ielts.js
src = io.open(D('webapp/data/ielts.js'), encoding='utf-8').read()
head = src[:src.index('window.IELTS_WORDS')]
ws = json.loads(src[src.index('['):src.rindex(']') + 1])
assert len(ws) == 9388
byw = {x['w']: x for x in ws}

new_entries = []
del_mothers = []      # 03 纯词：整词删除
for w, r in res.items():
    assert w in byw, w
    if r['new_m']:
        byw[w]['m'] = r['new_m']
    else:
        del_mothers.append(w)
    for e in r['vp_entries']:
        new_entries.append(e)
print('新词条:', len(new_entries), '| 消失母词:', len(del_mothers), del_mothers)

# 进度里的消失母词（需清理账本）
st = json.load(io.open(D('webapp/data/state.json'), encoding='utf-8'))
prog = st['words']['progress']
learned_del = [w for w in del_mothers if w in prog]
print('消失母词中已学（进度清零重学）:', len(learned_del), learned_del)

del_set = set(del_mothers)
learned_kept, unlearned = [], []
for x in ws:
    if x['w'] in del_set: continue
    (learned_kept if x['w'] in prog else unlearned).append(x)
# 注意：以 progress 判已学/未学（数组前缀应与之一致）
prefix_learned = [x['w'] for x in ws[:3139] if x['w'] not in del_set]
assert set(prefix_learned) == (set(prog) - del_set), '已学前缀与进度不一致'

# 新词条插未学段同档末尾
tier_last = {}
for i, x in enumerate(unlearned):
    t = scores.get(x['w'])
    if t: tier_last[t] = i
for t in reversed(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D']):
    ins = [e for e in new_entries if e['tier'] == t]
    if not ins: continue
    pos = tier_last.get(t, len(unlearned) - 1)
    objs = [{'w': e['form'], 'm': e['m']} for e in ins]
    unlearned = unlearned[:pos + 1] + objs + unlearned[pos + 1:]
    shift = len(objs)
    tier_last = {k: (v + shift if v > pos else v) for k, v in tier_last.items()}
    tier_last[t] = pos + shift
new_ws = learned_kept + unlearned
CUR_NEW = len(learned_kept)
assert len(new_ws) == 9388 - len(del_mothers) + len(new_entries)
assert set(x['w'] for x in new_ws[:CUR_NEW]) == set(prog) - del_set
for e in new_entries:
    assert ' ' in e['form'] and all(s.startswith('vp.') for s in e['m'])
print(f'数组：{len(ws)} -> {len(new_ws)} | 已学段 3139 -> {CUR_NEW}')

# ② vp_map：删全部母词条目（113 混合 + 9 纯）
vpm_src = io.open(D('webapp/data/vp_map.js'), encoding='utf-8').read()
vpm = json.loads(vpm_src.split('window.VP_MAP = ')[1].split(';\n')[0])
for w in res: vpm.pop(w, None)
for w in vpm: assert byw.get(w, {}).get('m', ['vp.']) and any(s.startswith('vp.') for s in byw[w]['m']) if w in byw else True
# 剩余 vp_map 词都应在书内且仍含 vp 义（35-9=26 个纯单词）
for w in list(vpm):
    assert w in byw and any(s.startswith('vp.') for s in byw[w]['m']), 'vp_map 残留异常: ' + w

# ③ chunk_map：删消失母词、加新词条
cm_src = io.open(D('webapp/data/chunk_map.js'), encoding='utf-8').read()
cm = json.loads(cm_src.split('window.CHUNK_MAP = ')[1].split(';\n')[0])
for w in del_mothers: cm.pop(w, None)
for e in new_entries:
    assert ''.join(b[0] for b in e['chunks']) == e['form'], 'chunks 拼接: ' + e['form']
    cm[e['form']] = e['chunks']
book_set = set(x['w'] for x in new_ws)
for w in list(cm):
    assert w in book_set, 'chunk_map 多余: ' + w

# ④ state.json：清消失母词进度及引用，游标更新，rev+100
for w in learned_del: prog.pop(w, None)
snap = st['words'].get('revSnap') or {}
if snap.get('keys'):
    snap['keys'] = [k for k in snap['keys'] if k not in del_set]
    st['words']['revSnap'] = snap
rt = st['words'].get('reviewedToday') or []
st['words']['reviewedToday'] = [k for k in rt if k not in del_set]
st['words']['newCursor'] = CUR_NEW
st['rev'] = st.get('rev', 0) + 100

# ⑤ 落盘（四备份）
for f in ('webapp/data/ielts.js', 'webapp/data/vp_map.js', 'webapp/data/chunk_map.js', 'webapp/data/state.json'):
    shutil.copy(D(f), D(f) + '.bak-preVpsp-20261004')
io.open(D('webapp/data/ielts.js'), 'w', encoding='utf-8').write(
    head + 'window.IELTS_WORDS = ' + json.dumps(new_ws, ensure_ascii=False, separators=(',', ':')) + ';\n')
io.open(D('webapp/data/vp_map.js'), 'w', encoding='utf-8').write(
    '// 介词动词映射（v2_vp_merge 自动维护）：词 → {义项下标: 英语介词}\nwindow.VP_MAP = ' +
    json.dumps(vpm, ensure_ascii=False, separators=(',', ':')) + ';\n')
io.open(D('webapp/data/chunk_map.js'), 'w', encoding='utf-8').write(
    '// 词根词缀拆块表（tools/v2_chk_merge2.py + ckma_merge.py + vpsp_merge.py 维护）：词 → [[块,块义],...]，块拼接逐字符还原原词\nwindow.CHUNK_MAP = ' +
    json.dumps(cm, ensure_ascii=False, separators=(',', ':')) + ';\n')
io.open(D('webapp/data/state.json'), 'w', encoding='utf-8').write(json.dumps(st, ensure_ascii=False))
print(f'已全部落盘：ielts {len(new_ws)} 词、vp_map {len(vpm)} 条、chunk_map {len(cm)} 条、newCursor {CUR_NEW}、rev {st["rev"]}')
