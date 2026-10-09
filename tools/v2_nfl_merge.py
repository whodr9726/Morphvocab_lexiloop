# -*- coding: utf-8 -*-
"""名词味修补合并：nfl_01~04 → ielts.js + 新义项统计"""
import json, io, sys, os, re
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

POS_RE = re.compile(r'^(n|v|vt|vi|vp|adj|adv|prep|conj|pron|aux|int|art|num)\. ')
FORBID = re.compile(r'[()（）\[\]【】…‥=/、;;]')
new_m = {}
for n in range(1, 5):
    p = os.path.join(ROOT, 'tools', 'v2_out', f'nfl_{n:02d}.json')
    if not os.path.exists(p):
        print('缺输出:', p); sys.exit(1)
    new_m.update(json.load(io.open(p, encoding='utf-8')))
print('nfl 覆盖词数:', len(new_m))
missing = [w for w in new_m if w not in idx]
if missing:
    print('异常词:', missing[:5]); sys.exit(1)
errs = changed = 0
for w, ms in new_m.items():
    for m in ms:
        if not POS_RE.match(m) or FORBID.search(m):
            errs += 1; print('格式错:', w, m[:24])
    if ms != ws[idx[w]]['m']:
        changed += 1
    ws[idx[w]]['m'] = ms
assert not errs, f'{errs} 个错误，中止'
io.open(P, 'w', encoding='utf-8').write(head + 'window.IELTS_WORDS = ' + json.dumps(ws, ensure_ascii=False, separators=(',', ':')) + ';\n')
s2 = io.open(P, encoding='utf-8').read()
back = json.loads(s2[s2.index('['):s2.rindex(']') + 1])
assert len(back) == 9388
fresh = set()
for x in back:
    for m in x['m']:
        g = m.split('. ', 1)
        if len(g) == 2 and g[1] not in old_senses:
            fresh.add(g[1])
print(f'实际改动词: {changed}，新义项文本: {len(fresh)} 个（需增量音频）')
