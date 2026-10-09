# -*- coding: utf-8 -*-
"""词义审核合并：v2_out/aud_01~12 → webapp/data/ielts.js（结尾跑，跑前自动备份）
不变量：词数 9388 守恒、词序不变、改动词的义项条数不变；只替换整词 m。"""
import json, io, os, sys, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IELTS = os.path.join(ROOT, 'webapp/data/ielts.js')

src = io.open(IELTS, encoding='utf-8').read()
head = src[:src.index('window.IELTS_WORDS')]
ws = json.loads(src[src.index('['):src.rindex(']') + 1])
assert len(ws) == 9523, f'词数异常 {len(ws)}'

fixed = {}
for n in range(1, 4):
    p = os.path.join(ROOT, 'tools/v2_out', f'dup_{n:02d}.json')
    if not os.path.exists(p):
        print('缺输出:', p); sys.exit(1)
    fixed.update(json.load(io.open(p, encoding='utf-8')))
print('待改写词:', len(fixed))

changed_senses = kept = words_changed = 0
for w in ws:
    if w['w'] not in fixed:
        continue
    new = fixed[w['w']]
    assert isinstance(new, list) and len(new) == len(w['m']), f"{w['w']} 义项数不一致"
    for a, b in zip(new, w['m']):
        if a != b:
            changed_senses += 1
        else:
            kept += 1
    w['m'] = new
    words_changed += 1

shutil.copy(IELTS, IELTS + '.bak-v2aud-20261003')
out = head + 'window.IELTS_WORDS = ' + json.dumps(ws, ensure_ascii=False, separators=(',', ':')) + ';\n'
io.open(IELTS, 'w', encoding='utf-8').write(out)
print(f'已合并：改写 {words_changed} 词 / {changed_senses} 义项变更 / {kept} 义项保持原样；备份 ielts.js.bak-v2aud2-20261003')
json.dump(fixed, io.open(os.path.join(ROOT, 'tools/v2_out/dup_merged_applied.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('已写 tools/v2_out/dup_merged_applied.json')
