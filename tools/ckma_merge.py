# -*- coding: utf-8 -*-
"""拆块补全合并：v2_out/ckma_01~02（只含改拆词）→ chunk_map.js 增量覆盖。
校验：输出词在册、拼接还原、块数 1~4、二元组；合并后全表三重复检。跑前备份。"""
import json, io, os, sys, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CM = os.path.join(ROOT, 'webapp/data/chunk_map.js')

cur = json.loads(io.open(CM, encoding='utf-8').read().split('window.CHUNK_MAP = ')[1].split(';\n')[0])
delta = {}
for n in (1, 2, 3):
    p = os.path.join(ROOT, 'tools/v2_out', f'ckma_0{n}.json')
    if not os.path.exists(p):
        print('缺输出:', p); sys.exit(1)
    delta.update(json.load(io.open(p, encoding='utf-8')))
print('待改拆词:', len(delta))

bad = 0
for w, blocks in delta.items():
    if w not in cur: print('不在册:', w); bad += 1; continue
    if not (1 <= len(blocks) <= 4): print('块数异常:', w); bad += 1; continue
    texts = [b[0] for b in blocks if isinstance(b, list) and len(b) == 2 and isinstance(b[0], str) and isinstance(b[1], str)]
    if len(texts) != len(blocks) or ''.join(texts) != w: print('块形/拼接异常:', w); bad += 1
if bad: sys.exit(1)

single_before = sum(1 for v in cur.values() if len(v) == 1)
cur.update(delta)
single_after = sum(1 for v in cur.values() if len(v) == 1)

# 合并后全表三重复检
book = json.loads(io.open(os.path.join(ROOT, 'webapp/data/ielts.js'), encoding='utf-8').read()
                  .split('window.IELTS_WORDS = ')[1].split(';\n')[0])
book_set = set(x['w'] for x in book)
for w, blocks in cur.items():
    texts = [b[0] for b in blocks]
    assert ''.join(texts) == w, '拼接: ' + w
    assert 1 <= len(blocks) <= 4, '块数: ' + w
missing = [x['w'] for x in book if x['w'] not in cur and len(x['w']) > 3]
print(f'全表复检通过：{len(cur)} 词；单块 {single_before} -> {single_after}；缺拆 {len(missing)}')

shutil.copy(CM, CM + '.bak-preaudit-20261004')
out = ('// 词根词缀拆块表（tools/v2_chk_merge2.py + ckma_merge.py 维护，规范 tools/prompts/ckm_prompt_v2.md）：词 → [[块,块义],...]，块拼接逐字符还原原词\n'
       'window.CHUNK_MAP = ' + json.dumps(cur, ensure_ascii=False, separators=(',', ':')) + ';\n')
io.open(CM, 'w', encoding='utf-8').write(out)
print('已写 chunk_map.js')
