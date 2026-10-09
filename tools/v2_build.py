# -*- coding: utf-8 -*-
"""词义库 v2 合并器：全部批次校验通过后，把新释义写进新 ielts.js
用法：python tools/v2_build.py --dry   # 预检（不写文件）
      python tools/v2_build.py         # 正式写入（原库已有备份）"""
import json, io, os, re, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'webapp', 'data', 'ielts.js')
BAK = os.path.join(ROOT, 'webapp', 'data', 'ielts.js.bak-v1-20260927')
ODIR = os.path.join(ROOT, 'tools', 'v2_out')
DRY = '--dry' in sys.argv

assert os.path.exists(BAK), '原库备份不存在，中止'

# 1) 原词库（保序）
s = io.open(SRC, encoding='utf-8').read()
orig = json.loads(s[s.index('['):s.rindex(']') + 1])
orig_words = [x['w'] for x in orig]
assert len(orig) == 9388, f'原库词数 {len(orig)} != 9388'

# 2) 收集全部输出
new_m = {}
outs = ['pilot'] + [f'batch_{i:02d}' for i in range(1, 39)]
missing_files = []
for name in outs:
    p = os.path.join(ODIR, name + '.json')
    if not os.path.exists(p):
        missing_files.append(name)
        continue
    new_m.update(json.load(io.open(p, encoding='utf-8')))
if missing_files:
    print('缺输出文件:', missing_files)
    sys.exit(1)

# 3) 词数守恒（原词序不变，m 替换；跨词性重复义项自动去重——保留首条=最高频，符合"一个意思只出现一次"）
missing = [w for w in orig_words if w not in new_m]
extra = [w for w in new_m if w not in set(orig_words)]
print(f'合并: {len(new_m)} 词；缺 {len(missing)}，多 {len(extra)}')
if missing or extra:
    print('缺词样例:', missing[:10]); print('多词样例:', extra[:10])
    sys.exit(1)

deduped = 0
merged = []
for w in orig_words:
    seen = set()
    out = []
    for m in new_m[w]:
        sense = m.split('. ', 1)[-1] if '. ' in m else m
        if sense in seen:
            deduped += 1
            continue
        seen.add(sense)
        out.append(m)
    merged.append({'w': w, 'm': out})
print(f'跨词性重复义项去重: {deduped} 条')

# 4) 学习记录零接触声明（只读校验 rev）
st = json.load(io.open(os.path.join(ROOT, 'webapp', 'data', 'state.json'), encoding='utf-8'))
print('state.json rev（合并前后都不动它）:', st.get('rev'))

if DRY:
    total = sum(len(x['m']) for x in merged)
    print(f'[dry] 全部就绪：9388 词，总义项 {total}，平均 {total/9388:.1f} 义/词')
    sys.exit(0)

# 5) 写新库（原前缀风格保留，标注 v2）
body = json.dumps(merged, ensure_ascii=False, separators=(',', ':'))
head = '// 雅思词书 v2（释义=glm-5.3-flash#max 逐词手写，按使用频率降序、跨词性交叉）— 共 9388 词\nwindow.IELTS_WORDS = '
io.open(SRC, 'w', encoding='utf-8').write(head + body + ';\n')
print('已写入新 ielts.js（原库备份: ielts.js.bak-v1-20260927）')

# 6) 回读验证
s2 = io.open(SRC, encoding='utf-8').read()
back = json.loads(s2[s2.index('['):s2.rindex(']') + 1])
assert [x['w'] for x in back] == orig_words, '回读词序不一致！'
assert back[0]['m'] == new_m[orig_words[0]]
print('回读验证通过：词序一致、首词新释义就位')
