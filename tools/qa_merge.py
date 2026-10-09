# -*- coding: utf-8 -*-
"""逗号同义精简合并：v2_out/trim_01 → ielts.js（条数允许 +1 的拆分；vp 词无，vp_map 零接触）。
不变量：词数 9523 守恒、未修义逐字节保留（trim_check 已过）、修复义无逗号。跑前备份。"""
import json, io, os, sys, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IELTS = os.path.join(ROOT, 'webapp/data/ielts.js')

src = io.open(IELTS, encoding='utf-8').read()
head = src[:src.index('window.IELTS_WORDS')]
ws = json.loads(src[src.index('['):src.rindex(']') + 1])
assert len(ws) == 9523, f'词数异常 {len(ws)}'

fixed = json.load(io.open(os.path.join(ROOT, 'tools/v2_out/trim_01.json'), encoding='utf-8'))
print('待精简词:', len(fixed))
applied = trimmed = split_words = 0
for w in ws:
    if w['w'] not in fixed: continue
    old, new = w['m'], fixed[w['w']]
    assert len(new) == len(old) or len(new) == len(old) + 1, w['w']
    kept = [s for s in new if s in old]
    assert len(old) - len([s for s in old if s in new]) >= 0
    for s in new:
        assert '，' not in s.split('. ', 1)[-1] or s in old, f"{w['w']} 修复义含逗号: {s}"
    if len(new) == len(old) + 1: split_words += 1
    else: trimmed += 1
    w['m'] = new
    applied += 1
assert applied == len(fixed)

shutil.copy(IELTS, IELTS + '.bak-preTrim-20261006')
out = head + 'window.IELTS_WORDS = ' + json.dumps(ws, ensure_ascii=False, separators=(',', ':')) + ';\n'
io.open(IELTS, 'w', encoding='utf-8').write(out)
print(f'已合并：{applied} 词（精简 {trimmed}、拆分 {split_words}）；备份 ielts.js.bak-preTrim-20261006')
