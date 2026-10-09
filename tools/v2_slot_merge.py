# -*- coding: utf-8 -*-
"""方案B槽位层合并：slot_01~09 输出合并进 ielts.js（只动这 3508 词的 m）+ 槽位覆盖率统计"""
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
for n in range(1, 10):
    p = os.path.join(ROOT, 'tools', 'v2_out', f'slot_{n:02d}.json')
    if not os.path.exists(p):
        print('缺输出:', p); sys.exit(1)
    new_m.update(json.load(io.open(p, encoding='utf-8')))
print('slot 覆盖词数:', len(new_m))
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
print(f'实际改动词: {changed}，新义项文本: {len(fresh)} 个（需增量音频）')

# 槽位覆盖率审计（方案B验收指标）
SLOT = re.compile(r'(某人|某物|某事|做某事|某地|把某|为某|向某|对某|给某|与某|靠某|依某)')
verb_total = verb_slot = verb_label = 0
for x in back:
    for m in x['m']:
        g = re.match(r'^(v|vt|vi)\. (.+)$', m)
        if not g:
            continue
        verb_total += 1
        if g.group(1) in ('vt', 'vi'):
            verb_label += 1
        elif SLOT.search(g.group(2)):
            verb_slot += 1
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
cov = (verb_slot + verb_label) / verb_total * 100 if verb_total else 0
print(f'动词义: {verb_total}，带槽位 {verb_slot}，vt/vi 标签 {verb_label}，覆盖率 {cov:.0f}%')
print(f'形容词缺的: {adj_no_de}；副词带地: {adv_di}/{adv_tot}')
