# -*- coding: utf-8 -*-
"""组合拼写拆分表工程：>3 字母的词切批（构词法拆块）"""
import json, io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = io.open(os.path.join(ROOT, 'webapp/data/ielts.js'), encoding='utf-8').read()
ws = json.loads(s[s.index('['):s.rindex(']') + 1])
words = [x['w'] for x in ws if len(x['w']) > 3]
print('需拆词数:', len(words))
BD = os.path.join(ROOT, 'tools/v2_batches')
B = (len(words) + 11) // 12
for i in range(12):
    part = words[i * B:(i + 1) * B]
    json.dump(part, io.open(os.path.join(BD, f'chk_{i + 1:02d}.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'chk_{i + 1:02d}.json: {len(part)} 词')
