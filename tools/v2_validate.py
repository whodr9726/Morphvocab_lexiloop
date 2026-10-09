# -*- coding: utf-8 -*-
"""词义库 v2 全量校验器：校验 tools/v2_out/ 下所有批次输出
用法：python tools/v2_validate.py           # 校验全部已有输出
      python tools/v2_validate.py 01 02     # 只校验指定批
规则：词数守恒 / 单义项格式 / 词性合法 / 违禁符号 / 条数 1~10 / 无重复义项"""
import json, io, os, re, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BDIR = os.path.join(ROOT, 'tools', 'v2_batches')
ODIR = os.path.join(ROOT, 'tools', 'v2_out')

POS_OK = {'n', 'v', 'vt', 'vi', 'vp', 'adj', 'adv', 'prep', 'conj', 'pron', 'aux', 'int', 'art', 'num'}
POS_RE = re.compile(r'^(n|v|vt|vi|vp|adj|adv|prep|conj|pron|aux|int|art|num)\. (.+)$')
FORBID = re.compile(r'[()（）\[\]【】…‥=/、;;:：!！?？""'']')
dups = []   # 跨词性重复义项（非致命，合并时去重）

def validate_one(basename):
    bpath = os.path.join(BDIR, basename + '.json')
    opath = os.path.join(ODIR, basename + '.json')
    if not os.path.exists(bpath):
        return None
    if not os.path.exists(opath):
        return {'batch': basename, 'status': '未生成', 'errors': [], 'words': 0}
    items = json.load(io.open(bpath, encoding='utf-8'))
    out = json.load(io.open(opath, encoding='utf-8'))
    errs = []
    in_w = {it['w'] for it in items}
    out_w = set(out.keys())
    for w in sorted(in_w - out_w):
        errs.append(f'缺词 {w}')
    for w in sorted(out_w - in_w):
        errs.append(f'多词 {w}')
    for w, ms in out.items():
        if not isinstance(ms, list) or not ms:
            errs.append(f'{w} 空义项'); continue
        if not (1 <= len(ms) <= 10):
            errs.append(f'{w} 条数 {len(ms)}')
        seen_s = set()
        for m in ms:
            g = POS_RE.match(m)
            if not g:
                errs.append(f'{w} 格式错 {m[:18]!r}'); continue
            if g.group(1) not in POS_OK:
                errs.append(f'{w} 词性非法 {g.group(1)}')
            if FORBID.search(m):
                errs.append(f'{w} 违禁符号 {m[:20]!r}')
            if g.group(2) in seen_s:
                dups.append(f'{w} 重复义项 {g.group(2)}')   # 非致命：合并时自动去重（保留首条=最高频）
            seen_s.add(g.group(2))
    return {'batch': basename, 'status': 'PASS' if not errs else 'FAIL',
            'errors': errs[:15], 'words': len(out_w & in_w), 'errs_total': len(errs), 'dups': len(dups)}

names = sys.argv[1:]
if names:
    targets = []
    for n in names:
        if n.startswith(('diff', 'slot', 'rep', 'fin', 'wid', 'vt', 'nfl', 'batch')) or n == 'pilot':
            targets.append(n)
        else:
            targets.append(f'batch_{int(n):02d}')
else:
    targets = sorted(f.split('.')[0] for f in os.listdir(BDIR) if f.startswith('batch'))
if os.path.exists(os.path.join(BDIR, 'pilot.json')):
    targets = ['pilot'] + targets

total_err = 0
repair = {}
for t in targets:
    r = validate_one(t)
    if r is None:
        continue
    tag = r['status']
    total_err += r.get('errs_total', 0)
    print(f"[{tag}] {r['batch']}: {r['words']} 词, 错误 {r.get('errs_total', 0)}, 跨词性重复(自动去重) {r.get('dups', 0)}")
    for e in r['errors'][:6]:
        print('   -', e)
    if tag == 'FAIL':
        repair[r['batch']] = r['errors']
print(f'\n=== 总计错误 {total_err}，失败批次 {len(repair)} ===')
json.dump(repair, io.open(os.path.join(ROOT, 'tools', 'v2_repair.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('修复清单 → tools/v2_repair.json')
