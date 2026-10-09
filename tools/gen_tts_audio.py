# -*- coding: utf-8 -*-
"""批量预生成读音 MP3（edge-tts 在线神经语音）。

- 英文读音：en-US-JennyNeural → webapp/audio/w|p/<md5>.mp3，索引 window.AUDIO_INDEX
- 中文读音：zh-CN-XiaoxiaoNeural（听中文写词题型：词性用中文说）→ webapp/audio/zh/，索引 window.AUDIO_ZH
- 索引统一写入 webapp/data/audio_index.js
- 断点续跑：已存在且 >500B 的 mp3 自动跳过；文件名 = md5(实际合成文本)，清洗规则变化自然重新生成
- 顺序：短语 → 单词 → 中文单词 → 中文短语（先保证英文 cache 可用）

用法：python tools/gen_tts_audio.py [--limit N] [--zh N] [--en-only] [--zh-only]
"""
import asyncio
import hashlib
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import edge_tts  # noqa: E402
WEBAPP = os.path.join(ROOT, 'webapp')
DIRS = {'w': os.path.join(WEBAPP, 'audio', 'w'),
        'p': os.path.join(WEBAPP, 'audio', 'p'),
        'z': os.path.join(WEBAPP, 'audio', 'zh'),
        'c': os.path.join(WEBAPP, 'audio', 'zhc'),
        'zhp': os.path.join(WEBAPP, 'audio', 'zhp'),
        'zhs': os.path.join(WEBAPP, 'audio', 'zhs')}
INDEX_JS = os.path.join(WEBAPP, 'data', 'audio_index.js')
VOICE_EN = 'en-US-JennyNeural'
VOICE_ZH = 'zh-CN-XiaoxiaoNeural'
CONCURRENCY = 8
BATCH = 100

TTS_ALIAS = {
    'Mrs.': 'Misses', 'Mr.': 'Mister', 'i.e.': 'that is', 'e.g.': 'for example',
    'etc.': 'etcetera', 'A.M.': 'A M', 'p.m.': 'P M', 'o.k.': 'OK', 'No.': 'Number',
    'c/o': 'care of', 'b/l': 'B L', 'l/c': 'L C', 'A.D.': 'A D', 'B.C.': 'B C',
    'ms.': 'manuscript',
}
POS_RE = re.compile(r'^(n\.|v\.|vt\.|vi\.|adj\.|adv\.|pron\.|prep\.|conj\.|num\.|int\.|art\.)\s*')
POS_CN = {'n.': '名词', 'v.': '动词', 'vt.': '及物动词', 'vi.': '不及物动词', 'adj.': '形容词',
          'adv.': '副词', 'pron.': '代词', 'prep.': '介词', 'conj.': '连词', 'num.': '数词',
          'int.': '感叹词', 'art.': '冠词'}


def spoken_form(text):
    if text in TTS_ALIAS:
        return TTS_ALIAS[text]
    t = re.sub(r'_', ' ', text)
    t = re.sub(r"[^a-zA-Z0-9' \-]", ' ', t)
    return re.sub(r'\s+', ' ', t).strip() or text


def clean_zh(t):
    POS_CN2 = dict(POS_CN)
    POS_CN2.update({'pl.': '复数', 'sb.': '某人', 'sth.': '某物', 'a.': '形容词'})
    t = re.sub(r'\([a-zA-Z][^)]*\)', '', t)     # 英文括注整段去掉
    t = re.sub(r'[()（）]', '', t)
    # 词性标记转中文词性名（否则 TTS 把 v./int./pl. 读成英文字母）；分号转逗号
    t = re.sub(r'(?<![a-zA-Z0-9])(vt|vi|adj|a|adv|pron|prep|conj|num|int|art|pl|sb|sth|n|v)\.\s*',
               lambda m: POS_CN2.get(m.group(1) + '.', '') + ('，' if m.group(1) != 'sth.' else ''),
               t)
    t = re.sub(r';\s*', '，', t)
    t = re.sub(r'[/／]', '、', t)                # 斜杠是词书分隔符，中文朗读改为顿号
    t = re.sub(r'\s+', ' ', t)
    return t.strip(' ；;，, .') or t.strip()


def load_entries():
    """返回 (单词条目列表, 短语条目列表)，条目 {w, m0(首个释义), m(完整释义数组)}"""
    s = io.open(os.path.join(WEBAPP, 'data/phrases.js'), encoding='utf-8').read()
    phrases = [{'w': w, 'm0': m, 'm': [m]} for w, m in
               re.findall(r'\{w:"([^"]+)",\s*m:\["([^"]*)"', s)]
    s2 = io.open(os.path.join(WEBAPP, 'data/ielts.js'), encoding='utf-8').read()
    words = json.loads(s2[s2.index('['):s2.rindex(']') + 1])
    word_entries = []
    for x in words:
        m0 = x['m'][0] if x['m'] else ''
        word_entries.append({'w': x['w'], 'm0': m0, 'm': x.get('m') or []})
    return word_entries, phrases


# ── 精简朗读文本（B29/B30）：与 app.js zhSpeakText / sanitizeZhText / splitMeaningModules 同源同规则 ──
# B23 教训：跨语言正则一律显式 lookbehind，不依赖 \w；改正则必查替换回调
SPLIT_RE = re.compile(r'(?<![a-zA-Z0-9(])(vt|vi|adj|ad|aux|a|adv|pron|prep|conj|num|int|art|pl|sb|sth|n|v)[.．]\s*'
                      r'|(?<![a-zA-Z0-9(])缩(?=[^a-zA-Z]*[一-鿿])')
SANI_RE = re.compile(r'(?<![a-zA-Z0-9(])(vt|vi|adj|ad|aux|a|adv|pron|prep|conj|num|int|art|pl|sb|sth|n|v)[.．]\s*')
ZH_HEAD_RE = re.compile(r'^((?:vt|vi|adj|ad|aux|adv|pron|prep|conj|num|int|art|a|n|v)[.．]\s*|缩\s?)')
ZH_POS_FULL = {'n.': '名词，', 'v.': '动词，', 'vt.': '及物动词，', 'vi.': '不及物动词，', 'adj.': '形容词，',
               'adv.': '副词，', 'pron.': '代词，', 'prep.': '介词，', 'conj.': '连词，', 'num.': '数词，',
               'int.': '感叹词，', 'art.': '冠词，', 'pl.': '复数，', 'sb.': '某人，', 'sth.': '某物，',
               'a.': '形容词，', 'ad.': '副词，', 'aux.': '助动词，'}
_OVR = None

# ── 词义库 v2 逐义项音频（v6.9）：词性名文件 + 义项文件 ──
POS_NAME = {'n.': '名词', 'v.': '动词', 'vt.': '及物动词', 'vi.': '不及物动词', 'vp.': '介词动词', 'adj.': '形容词',
            'adv.': '副词', 'prep.': '介词', 'conj.': '连词', 'pron.': '代词', 'aux.': '助动词',
            'int.': '感叹词', 'art.': '冠词', 'num.': '数词', 'pl.': '复数'}


def build_sense_tasks():
    """词义名文件（14 个）+ 全库去重义项文件；键：pos 用 'n.' 形式，义项用原文文本"""
    tasks = []
    for pos, name in POS_NAME.items():
        tasks.append({'key': pos, 'dir': 'zhp', 'spoken': name, 'voice': VOICE_ZH})
    s2 = io.open(os.path.join(WEBAPP, 'data', 'ielts.js'), encoding='utf-8').read()
    words = json.loads(s2[s2.index('['):s2.rindex(']') + 1])
    seen = set()
    for x in words:
        for m in (x.get('m') or []):
            g = re.match(r'^(n|v|vt|vi|vp|adj|adv|prep|conj|pron|aux|int|art|num|pl)\. (.+)$', str(m))
            sense = g.group(2).strip() if g else None
            if sense and sense not in seen:
                seen.add(sense)
                # 声音层替换（仅 TTS 输入，显示与索引键不受影响）：
                # ① 地→第：小晓把结构助词"地"读轻声 de，与"的"无法区分；换"第"强制读 dì（用户要求的听觉区分，v6.15）
                # ② 得体→德体：小晓把"得体"的"得"误读成 dei；换同音"德"强制读 dé（2026-10-04 用户报 properly）
                spoken = sense.replace('地', '第').replace('得体', '德体')
                tasks.append({'key': sense, 'dir': 'zhs', 'spoken': spoken, 'voice': VOICE_ZH})
    return tasks


def split_modules(m):
    """复刻 splitMeaningModules：把释义数组元素切成词性模块（含"紧贴中文"、全角句点、缩标记）"""
    out = []
    for raw in (m or []):
        s = str(raw)
        marks = list(SPLIT_RE.finditer(s))
        if not marks:
            t = s.strip()
            if t:
                out.append(t)
            continue
        head = s[:marks[0].start()].strip()
        for i, mk in enumerate(marks):
            seg_start = mk.end()
            seg_end = marks[i + 1].start() if i + 1 < len(marks) else len(s)
            body = re.sub(r';\s*$', '', s[seg_start:seg_end]).strip()
            piece = ((head + ' ') if head else '') + mk.group(0).rstrip() + ' ' + body
            piece = piece.strip()
            if piece:
                out.append(piece)
            head = ''
    return out


def sanitize_zh(t):
    """复刻 sanitizeZhText：括注删除、=English 截断、词性→中文词性名、分号逗号、斜杠顿号"""
    s = re.sub(r'\([a-zA-Z][^)]*\)', '', t or '')
    s = re.sub(r'=[A-Za-z].*$', '', s)
    s = re.sub(r'[()（）]', '', s)
    s = SANI_RE.sub(lambda mm: ZH_POS_FULL.get((mm.group(1) or '') + '.', ''), s)
    s = re.sub(r';\s*', '，', s)
    s = re.sub(r'[/／]', '、', s)
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'^[\s，,;；]+', '', s).strip()
    return s or (t or '')


def condensed_spoken(entry):
    """复刻 zhSpeakText：人工精选表优先（B31），否则首词性模块 + 前 2 个义项"""
    global _OVR
    if _OVR is None:
        try:
            txt = io.open(os.path.join(WEBAPP, 'data', 'zh_override.js'), encoding='utf-8').read()
            mm = re.search(r'window\.ZH_READ_OVERRIDE = (\{.*?\});', txt, re.S)
            _OVR = json.loads(mm.group(1)) if mm else {}
        except Exception:
            _OVR = {}
    ovr = _OVR.get(entry.get('w'))
    if ovr:
        return sanitize_zh(ovr)
    mods = split_modules(entry.get('m'))
    if mods:
        first = mods[0]
        mm = ZH_HEAD_RE.match(first)
        head = mm.group(1) if mm else ''
        body = first[len(head):]
        senses = [x.strip() for x in re.split(r'[,，、;；]', body) if x.strip()]
        t = sanitize_zh(head + '，'.join(senses[:2]))
        if t:
            return t
    return sanitize_zh('；'.join(mods))


def build_tasks():
    word_entries, phrases = load_entries()
    tasks = []  # {key, dir, spoken, voice}

    for ph in phrases:                                              # 英文短语
        tasks.append({'key': ph['w'], 'dir': 'p', 'spoken': spoken_form(ph['w']), 'voice': VOICE_EN})
    for we in word_entries:                                         # 英文单词
        tasks.append({'key': we['w'], 'dir': 'w', 'spoken': spoken_form(we['w']), 'voice': VOICE_EN})
    # 介词动词的英文整体形式（"abide by"）：读音/答案都带介词（v6.14）
    try:
        vtxt = io.open(os.path.join(WEBAPP, 'data', 'vp_map.js'), encoding='utf-8').read()
        vm = re.search(r'window\.VP_MAP = (\{.*?\});', vtxt, re.S)
        vpm = json.loads(vm.group(1)) if vm else {}
        preps = {}
        for w, d in vpm.items():
            ps = sorted(set(d.values()))
            if ps:
                preps[w] = ps[0]
        for w, prep in preps.items():
            tasks.append({'key': w + ' ' + prep, 'dir': 'w', 'spoken': spoken_form(w + ' ' + prep), 'voice': VOICE_EN})
    except Exception as e:
        print('vp_map 读取失败（跳过介词动词音频）:', e)
    for we in word_entries:                                         # 中文（词性用中文说）
        pm = POS_RE.match(we['m0'])
        poscn = POS_CN.get(pm.group(1), '') if pm else ''
        meaning = we['m0'][pm.end():] if pm else we['m0']
        tasks.append({'key': we['w'], 'dir': 'z', 'spoken': clean_zh(poscn + '，' + meaning), 'voice': VOICE_ZH})
    for ph in phrases:                                              # 中文短语
        tasks.append({'key': ph['w'], 'dir': 'z', 'spoken': clean_zh(ph['m0']), 'voice': VOICE_ZH})
    for we in word_entries + phrases:                               # 中文精简版（B29：首词性+前2义项）
        tasks.append({'key': we['w'], 'dir': 'c', 'spoken': condensed_spoken(we), 'voice': VOICE_ZH})
    return tasks


def rel_path(d, spoken):
    h = hashlib.md5(spoken.encode('utf-8')).hexdigest()[:16]
    folder = {'z': 'zh', 'c': 'zhc'}.get(d, d)  # zh/zhc 目录名与内部键不同，其余一致
    return f'audio/{folder}/{h}.mp3', os.path.join(DIRS[d], h + '.mp3')


def write_index(en_map, zh_map, zhc_map, pos_map=None, sense_map=None):
    # 单侧重生成时其他侧映射为空，必须并回旧索引，否则会把另一半清空（曾导致英文索引被清）
    olds = {}
    pats = {'en': r'window\.AUDIO_INDEX = (\{.*?\});', 'zh': r'window\.AUDIO_ZH = (\{.*?\});',
            'zhc': r'window\.AUDIO_ZHC = (\{.*?\});', 'pos': r'window\.AUDIO_POS = (\{.*?\});',
            'sense': r'window\.AUDIO_SENSE = (\{.*?\});'}
    if os.path.exists(INDEX_JS):
        try:
            txt = io.open(INDEX_JS, encoding='utf-8').read()
            for k, pat in pats.items():
                mm = re.search(pat, txt, re.S)
                if mm:
                    olds[k] = json.loads(mm.group(1))
        except Exception:
            pass
    en_map = {**olds.get('en', {}), **(en_map or {})}
    zh_map = {**olds.get('zh', {}), **(zh_map or {})}
    zhc_map = {**olds.get('zhc', {}), **(zhc_map or {})}
    pos_map = {**olds.get('pos', {}), **(pos_map or {})}
    sense_map = {**olds.get('sense', {}), **(sense_map or {})}
    with io.open(INDEX_JS, 'w', encoding='utf-8') as f:
        f.write('// 预生成读音索引（tools/gen_tts_audio.py 自动维护）' + chr(10))
        f.write('window.AUDIO_INDEX = ')
        json.dump(en_map, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';' + chr(10) + 'window.AUDIO_ZH = ')
        json.dump(zh_map, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';' + chr(10) + 'window.AUDIO_ZHC = ')
        json.dump(zhc_map, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';' + chr(10) + 'window.AUDIO_POS = ')
        json.dump(pos_map, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';' + chr(10) + 'window.AUDIO_SENSE = ')
        json.dump(sense_map, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';' + chr(10))


async def gen_one(spoken, path, voice, sem):
    async with sem:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(spoken, voice).save(path)
                return True
            except Exception:
                await asyncio.sleep(1.5 * (attempt + 1))
    return False


async def main(args):
    for d in DIRS.values():
        os.makedirs(d, exist_ok=True)

    def bucket(d):
        return {'w': 'en', 'p': 'en', 'z': 'zh', 'c': 'zhc', 'zhp': 'pos', 'zhs': 'sense'}[d]

    groups = {'en': [], 'zh': [], 'zhc': [], 'pos': [], 'sense': []}
    if '--sense' in args:
        all_tasks = build_sense_tasks()
        for t in all_tasks:
            groups[bucket(t['dir'])].append(t)
    else:
        for t in build_tasks():
            groups[bucket(t['dir'])].append(t)

    if '--en-only' in args:
        tasks = groups['en']
    elif '--zh-only' in args:
        tasks = groups['zh']
    elif '--zhc-only' in args:
        tasks = groups['zhc']
    elif '--sense' in args:
        tasks = groups['pos'] + groups['sense']
    else:
        tasks = groups['en'] + groups['zh'] + groups['zhc']
    if '--limit' in args:
        tasks = tasks[:int(args[args.index('--limit') + 1])]
    if '--zh' in args:
        tasks = groups['zh'][:int(args[args.index('--zh') + 1])]

    maps = {'en': {}, 'zh': {}, 'zhc': {}, 'pos': {}, 'sense': {}}
    todo = []
    reused = 0
    for t in tasks:
        rel, path = rel_path(t['dir'], t['spoken'])
        if os.path.exists(path) and os.path.getsize(path) > 500:
            maps[bucket(t['dir'])][t['key']] = rel
        elif t['dir'] == 'c':
            # 精简文本与全文一致（单词项/双义项词）时哈希相同 → 直接复用 audio/zh 已有文件，不重复生成
            # 注意：索引必须指向 zh 的 rel（真实存在的文件）；曾误写 zhc 路径导致 404 静音（B30 修复）
            rel_zh, zh_path = rel_path('z', t['spoken'])
            if os.path.exists(zh_path) and os.path.getsize(zh_path) > 500:
                maps['zhc'][t['key']] = rel_zh
                reused += 1
                continue
            todo.append(dict(t, path=path, rel=rel))
        else:
            todo.append(dict(t, path=path, rel=rel))
    print(f'共 {len(tasks)} 条，已完成 {sum(len(m) for m in maps.values())}，复用zh {reused}，待生成 {len(todo)}', flush=True)

    if '--priority' in args:
        # 优先名单（JSON 数组，如今日到期词）：插队最先生成，其余保持原序（稳定排序）
        try:
            pri = json.load(io.open(args[args.index('--priority') + 1], encoding='utf-8'))
            pri_set = set(pri)
            todo.sort(key=lambda t: 0 if t['key'] in pri_set else 1)
            print(f'优先名单 {len(pri)} 条，命中待生成 {sum(1 for t in todo if t["key"] in pri_set)} 条', flush=True)
        except Exception as e:
            print('优先名单读取失败，按原序生成：', e, flush=True)

    sem = asyncio.Semaphore(CONCURRENCY)
    done, fail = 0, []

    def collect(batch, results):
        nonlocal done
        for t, okk in zip(batch, results):
            if okk and os.path.exists(t['path']) and os.path.getsize(t['path']) > 500:
                maps[bucket(t['dir'])][t['key']] = t['rel']
                done += 1
            else:
                fail.append(t)

    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        collect(batch, await asyncio.gather(*[gen_one(t['spoken'], t['path'], t['voice'], sem) for t in batch]))
        write_index(maps['en'], maps['zh'], maps['zhc'], maps['pos'], maps['sense'])
        print(f'进度 {done}/{len(todo)}（失败 {len(fail)}）', flush=True)

    if fail:
        print(f'重试 {len(fail)} 条失败项…', flush=True)
        collect(fail, await asyncio.gather(*[gen_one(t['spoken'], t['path'], t['voice'], sem) for t in fail]))
        write_index(maps['en'], maps['zh'], maps['zhc'], maps['pos'], maps['sense'])

    # 待生成 0 时上面循环不执行 → write_index 不会被调 → 索引永远停留旧状态
    # （曾因此英文索引被清空后始终无法自愈，英文朗读全哑）
    write_index(maps['en'], maps['zh'], maps['zhc'], maps['pos'], maps['sense'])
    print(f'完成：英文 {len(maps["en"])}，中文 {len(maps["zh"])}，精简中文 {len(maps["zhc"])}，词性名 {len(maps["pos"])}，义项 {len(maps["sense"])}。', flush=True)


if __name__ == '__main__':
    asyncio.run(main(sys.argv))
