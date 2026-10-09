# -*- coding: utf-8 -*-
"""介词动词合并：vp_01/02 → ielts.js（m 替换）+ data/vp_map.js（window.VP_MAP）"""
import json, io, sys, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'webapp', 'data', 'ielts.js')
VPOUT = os.path.join(ROOT, 'webapp', 'data', 'vp_map.js')

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

vp_map = {}
merged = 0
for n in (1, 2):
    p = os.path.join(ROOT, 'tools', 'v2_out', f'vp_{n:02d}.json')
    if not os.path.exists(p):
        print('缺输出:', p); sys.exit(1)
    data = json.load(io.open(p, encoding='utf-8'))
    for w, d in data.items():
        if w not in idx:
            print('异常词:', w); sys.exit(1)
        ms = d['m']
        vp = d.get('vp') or {}
        # 校验 vp 下标与介词
        for k, prep in vp.items():
            i = int(k)
            if not (0 <= i < len(ms)) or not ms[i].startswith('vp. '):
                print(f'vp 下标错位: {w}[{k}]'); sys.exit(1)
            if not re.match(r'^[a-z]+$', prep):
                print(f'vp 介词非法: {w} {prep}'); sys.exit(1)
        ws[idx[w]]['m'] = ms
        if vp:
            vp_map[w] = vp
        merged += 1

io.open(P, 'w', encoding='utf-8').write(head + 'window.IELTS_WORDS = ' + json.dumps(ws, ensure_ascii=False, separators=(',', ':')) + ';\n')
io.open(VPOUT, 'w', encoding='utf-8').write('// 介词动词映射（v2_vp_merge 自动维护）：词 → {义项下标: 英语介词}\nwindow.VP_MAP = ' + json.dumps(vp_map, ensure_ascii=False, separators=(',', ':')) + ';\n')

s2 = io.open(P, encoding='utf-8').read()
back = json.loads(s2[s2.index('['):s2.rindex(']') + 1])
assert len(back) == 9388 and [x['w'] for x in back] == [x['w'] for x in ws]
fresh = set()
for x in back:
    for m in x['m']:
        g = m.split('. ', 1)
        if len(g) == 2 and g[1] not in old_senses:
            fresh.add(g[1])
vp_senses = sum(1 for x in back for m in x['m'] if m.startswith('vp. '))
print(f'合并 {merged} 词；vp 词条 {len(vp_map)}，vp 义项 {vp_senses}；新义项文本 {len(fresh)} 个')
