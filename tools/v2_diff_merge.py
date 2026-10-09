# -*- coding: utf-8 -*-
"""义项区分层合并：diff_01~17 输出合并进 ielts.js（只动这 6420 词的 m），并统计新增义项文本"""
import json, io, os, sys
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
for n in range(1, 18):
    p = os.path.join(ROOT, 'tools', 'v2_out', f'diff_{n:02d}.json')
    if not os.path.exists(p):
        print('缺输出:', p); sys.exit(1)
    new_m.update(json.load(io.open(p, encoding='utf-8')))

print('diff 覆盖词数:', len(new_m))
missing = [w for w in new_m if w not in idx]
if missing:
    print('异常词（不在词库）:', missing[:5]); sys.exit(1)

changed = 0
for w, ms in new_m.items():
    if ms != ws[idx[w]]['m']:
        ws[idx[w]]['m'] = ms
        changed += 1
io.open(P, 'w', encoding='utf-8').write(head + 'window.IELTS_WORDS = ' + json.dumps(ws, ensure_ascii=False, separators=(',', ':')) + ';\n')

# 回读 + 统计新义项文本（需要增量生成音频的量）
s2 = io.open(P, encoding='utf-8').read()
back = json.loads(s2[s2.index('['):s2.rindex(']') + 1])
assert len(back) == 9388 and [x['w'] for x in back] == [x['w'] for x in ws]
fresh = set()
for x in back:
    for m in x['m']:
        g = m.split('. ', 1)
        if len(g) == 2 and g[1] not in old_senses:
            fresh.add(g[1])
print(f'实际改动词: {changed}，新义项文本: {len(fresh)} 个（需增量生成音频）')
