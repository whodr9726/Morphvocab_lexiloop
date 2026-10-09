# -*- coding: utf-8 -*-
"""丢义修复合并：v2_out/loss_01 → ielts.js；受影响 vp 词做 vp_map 下标重映射。
不变量：词数 9388 守恒、每词旧义 multiset ⊆ 新义、vp 词的每个 vp 义重定位成功。跑前双备份。"""
import json, io, os, sys, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IELTS = os.path.join(ROOT, 'webapp/data/ielts.js')
VPM = os.path.join(ROOT, 'webapp/data/vp_map.js')

src = io.open(IELTS, encoding='utf-8').read()
head = src[:src.index('window.IELTS_WORDS')]
ws = json.loads(src[src.index('['):src.rindex(']') + 1])
assert len(ws) == 9388, f'词数异常 {len(ws)}'

fixed = {}
for _n in (1, 2):
    fixed.update(json.load(io.open(os.path.join(ROOT, 'tools/v2_out', f'loss_{_n:02d}.json'), encoding='utf-8')))
print('待补义词:', len(fixed))

vpm_src = io.open(VPM, encoding='utf-8').read()
vpm = json.loads(vpm_src.split('window.VP_MAP = ')[1].split(';\n')[0])
vpm_changed = False
applied = 0
for w in ws:
    if w['w'] not in fixed: continue
    new = fixed[w['w']]
    old = w['m']
    rest = new[:]
    for s in old:
        assert s in rest, f"{w['w']} 旧义丢失 {s}"
        rest.remove(s)
    if len(rest) == 0 and new == old:
        continue   # 已应用过的批次重放：幂等跳过
    # vp_map 下标重映射：旧下标义 → 在新数组中重新定位
    if w['w'] in vpm:
        nv = {}
        for idx, prep in vpm[w['w']].items():
            s = old[int(idx)]
            ni = new.index(s) if s in new else -1
            assert ni >= 0, f"{w['w']} vp 义重定位失败: {s}"
            nv[str(ni)] = prep
        if nv != vpm[w['w']]:
            vpm[w['w']] = nv; vpm_changed = True
    w['m'] = new
    applied += 1

shutil.copy(IELTS, IELTS + '.bak-preloss-20261004')
out = head + 'window.IELTS_WORDS = ' + json.dumps(ws, ensure_ascii=False, separators=(',', ':')) + ';\n'
io.open(IELTS, 'w', encoding='utf-8').write(out)
print(f'已合并 {applied} 词；备份 ielts.js.bak-preloss-20261004')

if vpm_changed:
    shutil.copy(VPM, VPM + '.bak-20261004')
    io.open(VPM, 'w', encoding='utf-8').write(
        '// 介词动词映射（v2_vp_merge 自动维护）：词 → {义项下标: 英语介词}\nwindow.VP_MAP = ' +
        json.dumps(vpm, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('vp_map 下标已重映射并写盘（备份 vp_map.js.bak-20261004）')
else:
    print('vp_map 无需变动')
json.dump(fixed, io.open(os.path.join(ROOT, 'tools/v2_out/loss_merged_applied.json'), 'w', encoding='utf-8'), ensure_ascii=False)
