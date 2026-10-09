# -*- coding: utf-8 -*-
"""词根词缀拆块合并 v2：v2_out/chk_01~12（[[块,义],...]）→ webapp/data/chunk_map.js
校验：拼接还原（逐字符，含大小写）+ 块数 1~4 + 二元组 + 覆盖 >3 字母全词。跑前备份。"""
import json, io, os, sys, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CM = os.path.join(ROOT, 'webapp/data/chunk_map.js')

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
book_set = set(book)
bad_join = bad_cnt = bad_shape = extra = 0
missing = []
multi = single = 0
for w, blocks in merged.items():
    if w not in book_set:
        extra += 1; continue
    if not isinstance(blocks, list) or not (1 <= len(blocks) <= 4):
        bad_cnt += 1; print('块数异常:', w, blocks); continue
    if len(blocks) == 1: single += 1
    else: multi += 1
    texts = []
    for b in blocks:
        if not (isinstance(b, list) and len(b) == 2 and isinstance(b[0], str) and b[0] and isinstance(b[1], str)):
            bad_shape += 1; print('块形异常:', w, b); texts = None; break
        texts.append(b[0])
    if texts is None: continue
    if ''.join(texts) != w:
        bad_join += 1
        if bad_join <= 5: print('拼接不还原:', w, blocks)
for w in book:
    if w not in merged and len(w) > 3:
        missing.append(w)
print(f'拼接错误 {bad_join}，块数异常 {bad_cnt}，块形异常 {bad_shape}，多余词 {extra}，缺拆词 {len(missing)}，多块 {multi} 单块 {single}')
if bad_join or bad_cnt or bad_shape or extra:
    sys.exit(1)

shutil.copy(CM, CM + '.bak-syllable-20261003')
out = ('// 词根词缀拆块表（tools/v2_chk_merge2.py 维护，规范 tools/prompts/ckm_prompt_v2.md）：词 → [[块,块义],...]，块拼接逐字符还原原词\n'
       'window.CHUNK_MAP = ' + json.dumps(merged, ensure_ascii=False, separators=(',', ':')) + ';\n')
io.open(CM, 'w', encoding='utf-8').write(out)
print('已写 chunk_map.js（含块义，v6.19 结构）')
