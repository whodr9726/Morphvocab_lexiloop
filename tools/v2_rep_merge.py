# -*- coding: utf-8 -*-
"""方案B修复轮合并：rep_01~05 输出合并进 ielts.js + 宽口径覆盖率终审"""
import json, io, os, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'webapp', 'data', 'ielts.js')

s = io.open(P, encoding='utf-8').read()
head = s[:s.index('window.IELTS_WORDS')]
ws = json.loads(s[s.index('['):s.rindex(']') + 1])
idx = {x['w']: i for i, x in enumerate(ws)}
old_senses = set()
for x in ws:
    for m in x['m']:
        g = m.split('. ', 1)
        if len(g) == 2:
            old_senses.add(g[1])

new_m = {}
for n in range(1, 6):
    p = os.path.join(ROOT, 'tools', 'v2_out', f'rep_{n:02d}.json')
    if not os.path.exists(p):
        print('缺输出:', p); sys.exit(1)
    new_m.update(json.load(io.open(p, encoding='utf-8')))
print('rep 覆盖词数:', len(new_m))
missing = [w for w in new_m if w not in idx]
if missing:
    print('异常词:', missing[:5]); sys.exit(1)

changed = 0
for w, ms in new_m.items():
    if ms != ws[idx[w]]['m']:
        ws[idx[w]]['m'] = ms
        changed += 1
io.open(P, 'w', encoding='utf-8').write(head + 'window.IELTS_WORDS = ' + json.dumps(ws, ensure_ascii=False, separators=(',', ':')) + ';\n')

s2 = io.open(P, encoding='utf-8').read()
back = json.loads(s2[s2.index('['):s2.rindex(']') + 1])
assert len(back) == 9388 and [x['w'] for x in back] == [x['w'] for x in ws]
fresh = set()
for x in back:
    for m in x['m']:
        g = m.split('. ', 1)
        if len(g) == 2 and g[1] not in old_senses:
            fresh.add(g[1])
print(f'实际改动词: {changed}，本轮新增义项文本: {len(fresh)} 个')

# 宽口径覆盖率终审
def has_slot(t):
    return ('某' in t) or bool(re.search(r'[把向对给与靠依从在某][一-鿿]', t))
verb = slot = label = vi_ok = 0
for x in back:
    for m in x['m']:
        g = re.match(r'^(v|vt|vi)\. (.+)$', m)
        if not g:
            continue
        verb += 1
        if g.group(1) in ('vt', 'vi'):
            label += 1
        elif has_slot(g.group(2)):
            slot += 1
adj_no_de = adv_di = adv_tot = 0
for x in back:
    for m in x['m']:
        g = re.match(r'^(adj|adv)\. (.+)$', m)
        if not g:
            continue
        if g.group(1) == 'adj' and not g.group(2).endswith('的'):
            adj_no_de += 1
        if g.group(1) == 'adv':
            adv_tot += 1
            if g.group(2).endswith('地'):
                adv_di += 1
print(f'动词义 {verb}：带槽 {slot} + vt/vi 标签 {label}，宽口径覆盖率 {(slot + label) / verb * 100:.0f}%')
print(f'形容词缺的: {adj_no_de}；副词带地: {adv_di}/{adv_tot}')
