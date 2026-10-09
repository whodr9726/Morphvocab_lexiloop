# -*- coding: utf-8 -*-
"""构词拆块表合并：chk_01~12 → data/chunk_map.js（校验：拼接还原 + 块数 1~4 + 词覆盖）"""
import json, io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
merged = {}
for n in range(1, 13):
    p = os.path.join(ROOT, 'tools/v2_out', f'chk_{n:02d}.json')
    if not os.path.exists(p):
        print('缺输出:', p); sys.exit(1)
    merged.update(json.load(io.open(p, encoding='utf-8')))
print('拆分表词数:', len(merged))

s = io.open(os.path.join(ROOT, 'webapp/data/ielts.js'), encoding='utf-8').read()
ws = json.loads(s[s.index('['):s.rindex(']') + 1])
book = [x['w'] for x in ws]
bad_join = bad_cnt = extra = 0
missing = []
for w in book:
    chunks = merged.get(w)
    if w not in merged:
        if len(w) > 3:
            missing.append(w)
        continue
    if ''.join(chunks).lower() != w.lower():
        bad_join += 1
        if bad_join <= 5:
            print('拼接不还原:', w, chunks)
    if not (1 <= len(chunks) <= 4):
        bad_cnt += 1
        print('块数异常:', w, chunks)
for w in merged:
    if w not in set(book):
        extra += 1
print(f'拼接错误 {bad_join}，块数异常 {bad_cnt}，多余词 {extra}，缺拆词 {len(missing)}（回落机械切）')
if bad_join or bad_cnt or extra:
    sys.exit(1)

out = os.path.join(ROOT, 'webapp/data/chunk_map.js')
io.open(out, 'w', encoding='utf-8').write('// 构词法拆块表（tools/v2 合并维护）：词 → [前缀/词根/后缀/复合块]，块拼接还原原词\nwindow.CHUNK_MAP = ' + json.dumps(merged, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('已写 chunk_map.js')
