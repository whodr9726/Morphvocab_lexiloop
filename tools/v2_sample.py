# -*- coding: utf-8 -*-
"""抽样新旧词库释义，供人工对照审查。输出 UTF-8 文件。"""
import json, random, io, sys, re

BASE = r"<项目根>"
NEW = BASE + r"\webapp\data\ielts.js"
OLD = BASE + r"\webapp\data\ielts.js.bak-v1-20260927"

def load(path):
    with io.open(path, "r", encoding="utf-8") as f:
        s = f.read()
    i = s.index("[")
    j = s.rindex("]")
    return json.loads(s[i:j+1])

new = load(NEW)
old = load(OLD)
newmap = {e["w"]: e["m"] for e in new}
oldmap = {e["w"]: e["m"] for e in e_old} if False else {e["w"]: e["m"] for e in old}

random.seed(20260927)  # 可复现
words = [e["w"] for e in new]
sample = random.sample(words, 100)

# 简单分类标记（便于覆盖简单词/多义词/技术词）
def nsense(w):
    return len(newmap.get(w, []))

lines = []
lines.append(u"# 抽样 100 词（new vs old）")
lines.append(u"总词数: new=%d old=%d" % (len(new), len(old)))
lines.append(u"")
for i, w in enumerate(sample, 1):
    lines.append(u"%3d. %s (义项数=%d)" % (i, w, nsense(w)))
    for m in newmap.get(w, []):
        lines.append(u"      NEW: %s" % m)
    om = oldmap.get(w)
    if om is None:
        lines.append(u"      OLD: <旧库无此词>")
    else:
        for m in om:
            lines.append(u"      OLD: %s" % m)
    lines.append(u"")

out = BASE + r"\tools\v2_sample_100.txt"
with io.open(out, "w", encoding="utf-8") as f:
    f.write(u"\n".join(lines))
print("sample written:", out)
print("new size:", len(new), "old size:", len(old))
missing_old = [w for w in sample if w not in oldmap]
print("sample words not in old:", len(missing_old), missing_old[:10])
