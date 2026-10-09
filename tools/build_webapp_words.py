# -*- coding: utf-8 -*-
"""把 coach/memory/lexicon.json（雅思词书释义表）转成 webapp/data/ielts.js"""
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(ROOT, 'coach/memory/lexicon.json'), encoding='utf-8'))
items = d['items']

POS_MAP = {'a.': 'adj.', 'ad.': 'adv.', '': ''}
POS_ORDER = {'n.': 0, 'v.': 1, 'vt.': 2, 'vi.': 3, 'adj.': 4, 'adv.': 5,
             'pron.': 6, 'prep.': 7, 'conj.': 8, 'num.': 9, 'int.': 10, 'art.': 11}


def norm_pos(p):
    p = (p or '').strip()
    return POS_MAP.get(p, p)


# 释义内部粘连的词性标记（如「违反vi. 破(裂)」）拆开；只拆紧跟在非空白字符后的，避免误伤正文
GLUED_POS = re.compile(r'(?<=[^\s.])(vi\.|vt\.|adj\.|adv\.|ad\.|pron\.|prep\.|conj\.|int\.|art\.|num\.)')


def split_glued(mean):
    if not GLUED_POS.search(mean):
        return [mean]
    parts = GLUED_POS.split(mean)
    out, cur = [], parts[0]
    for i in range(1, len(parts), 2):
        tag, rest = parts[i], parts[i + 1]
        if cur.strip():
            out.append(cur.strip())
        cur = tag + ' ' + rest
    if cur.strip():
        out.append(cur.strip())
    return out


merged = {}
order = []
for it in items:
    w = it['lemma'].strip()
    if not w:
        continue
    key = w.lower()
    pos = norm_pos(it.get('pos', ''))
    mean = re.sub(r'\s+', ' ', it['meaning_zh']).strip().strip('；;。. ')
    if not mean:
        continue
    if key not in merged:
        merged[key] = {'w': w, 'senses': []}
        order.append(key)
    for piece in split_glued(((pos + ' ' + mean) if pos else mean)):
        disp = re.sub(r'\s+', ' ', piece.strip())
        disp = re.sub(r'^ad\.', 'adv.', disp)
        if disp and disp not in merged[key]['senses']:
            merged[key]['senses'].append(disp)


POS_RE = re.compile(r'^(n\.|v\.|vt\.|vi\.|adj\.|adv\.|pron\.|prep\.|conj\.|num\.|int\.|art\.)\s*')

# 源书截断/错漏的人工校对释义（objective 的 "adj. [哲" 等 50 个），生成时覆盖
OVERRIDES = {
    # —— 多词性被截断只剩 "v. &" 的 40 个 ——
    'query': ['n. 疑问，询问', 'v. 询问，质疑'],
    'hoe': ['n. 锄头', 'v. 锄（地）'],
    'headlong': ['adj. 轻率的，仓促的', 'adv. 头向前地，轻率地'],
    'disuse': ['n. 不用，废弃'],
    'screech': ['v. 尖叫，发出尖锐刺耳的声音', 'n. 尖叫声'],
    'processing': ['n. 处理，加工，办理'],
    'ridicule': ['n. 嘲笑，奚落', 'vt. 嘲笑，愚弄'],
    'jingle': ['v. 发出叮当声', 'n. 叮当声'],
    'Brazilian': ['adj. 巴西的', 'n. 巴西人'],
    'southward': ['adj. 向南的', 'adv. 向南'],
    'itch': ['v. 发痒', 'n. 痒；渴望'],
    'volley': ['n. 齐射，齐发；（球）截击', 'v. 齐发，截击'],
    'sneer': ['v. 嘲笑，讥讽', 'n. 冷笑，讥笑'],
    'recompense': ['v. 补偿，酬报', 'n. 报酬，赔偿'],
    'Swedish': ['adj. 瑞典的', 'n. 瑞典语；瑞典人'],
    'heed': ['v. 注意，留意', 'n. 注意，留心'],
    'surmise': ['v. 猜测，推测', 'n. 猜测，推测'],
    'follow-up': ['n. 后续行动，跟进'],
    'chatter': ['vi. 喋喋不休；（鸟兽）啁啾作声', 'n. 闲聊，唠叨'],
    'broaden': ['v. 变宽，拓宽，扩大'],
    'eastward': ['adj. 向东的', 'adv. 向东'],
    'o.k.': ['adj. 好的，可以的', 'n. 同意'],
    'sprain': ['v. 扭伤', 'n. 扭伤'],
    'overcharge': ['v. 多收（钱），索价过高'],
    'tread': ['v. 踩，踏，行走', 'n. 踏面，胎面'],
    'squat': ['vi. 蹲坐，蹲下', 'adj. 矮胖的'],
    'Mexican': ['adj. 墨西哥的', 'n. 墨西哥人'],
    'Danish': ['adj. 丹麦的', 'n. 丹麦语'],
    'Moslem': ['n. 穆斯林', 'adj. 穆斯林的'],
    'entreat': ['vt. 恳求，乞求'],
    'proletarian': ['adj. 无产阶级的', 'n. 无产者'],
    'trot': ['vi. 小跑，快步走', 'n. 小跑'],
    'peck': ['vt. 啄', 'n. 啄'],
    'crimson': ['adj. 深红色的，绯红的', 'n. 深红色'],
    'scoff': ['v. 嘲笑，讥讽'],
    'Irish': ['adj. 爱尔兰的', 'n. 爱尔兰人'],
    'northward': ['adj. 向北的', 'adv. 向北'],
    'onward': ['adv. 向前地', 'adj. 向前的'],
    'scrub': ['n. 灌木丛', 'v. 擦洗，刷洗'],
    'xerox': ['vt. 复印', 'n. 复印件'],
    # —— 学科标签处截断、意思完全丢失的 7 个 ——
    'objective': ['adj. 客观的，不带偏见的', 'n. 目标，目的'],
    'sophisticated': ['adj. 先进的，精密的；见多识广的，老练的'],
    'mount': ['v. 登上，骑上；组织，发起', 'n. 山峰（用于山名前）'],
    'multiply': ['v. 乘，使相乘；成倍增加，繁殖'],
    'eclipse': ['n. （日、月）食', 'vt. 使黯然失色'],
    'aluminum': ['n. 铝'],
    'gasoline': ['n. 汽油'],
    # —— 其他源书错漏 ——
    'aminoacid': ['n. 氨基酸'],
    'bound': ['adj. 一定的，必然的；被束缚的；去往…的', 'v./n. 跳跃'],
    'ranking': ['n. 排名，地位'],
    'sphinx': ['n. 斯芬克斯，狮身人面像；谜一样的人'],
    'trochanter': ['n. （股骨的）转子；（昆虫的）转节'],
}

out = []
dropped_senses = 0
for key in order:
    e = merged[key]

    def sort_key(s):
        first = s.split(' ', 1)[0]
        return POS_ORDER.get(first, 99)
    e['senses'].sort(key=sort_key)
    # 词书占位释义（如「n. /」表示与相邻词性同义）没有实际内容，删除
    real = []
    for s in e['senses']:
        body = POS_RE.sub('', s).strip()
        if body in ('/', '', '-'):
            dropped_senses += 1
            continue
        real.append(s)
    if real:
        ov = OVERRIDES.get(e['w'].lower())
        if ov:
            real = ov          # 源书截断/错漏 → 人工校对释义
        out.append({'w': e['w'], 'm': real})

os.makedirs(os.path.join(ROOT, 'webapp/data'), exist_ok=True)
dst = os.path.join(ROOT, 'webapp/data/ielts.js')
with open(dst, 'w', encoding='utf-8') as f:
    f.write('// 雅思词书（乱序）— 由 coach/memory/lexicon.json 生成，共 %d 词\n' % len(out))
    f.write('window.IELTS_WORDS = ')
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('written', len(out), 'lemmas,', os.path.getsize(dst) // 1024, 'KB, 删除占位释义', dropped_senses, '条')
