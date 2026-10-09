/* ═══════════════════════════════════════════════════════════
 * 单词 & 短语 · 雅思闯关 — 纯本地 HTML 学习应用（完美万词王式）
 * 词书：雅思（data/ielts.js，9388 词，学完即转入每日循环复习）
 * 短语：生活常用短语（data/phrases.js，AI 每轮补充，永无止境）
 * 界面：新学模式 / 每日复习 两个入口；题型全为四选一
 * 批改：算法实时批改；每日报告上传，由 AI 事后查看并安排后续
 * 调度：类 SM-2 间隔重复 + 错误频率优先；AI 可通过 data/ai_plan.json 安排
 * 语音：仅浏览器内置朗读（TTS，可开关），无任何语音识别、不用 CUDA
 * ═══════════════════════════════════════════════════════════ */
'use strict';

/* ───────────── 常量 ───────────── */
// 测试沙盒：带 ?test=1 打开的页面用独立存档、不碰服务端账本、不上传报告，
// 与真实学习数据（Chrome 正常打开）完全隔离
const TEST_MODE = /[?&]test=1/.test(location.search);
const STORE_KEY = TEST_MODE ? 'wordApp_test' : 'wordApp_v1';
const APP_VER = TEST_MODE ? 'v6.36-test' : 'v6.36';
let TODAY = todayStr();
const PARTS = {
  words:   { pool: () => window.IELTS_WORDS, title: '单词 · 雅思' },
  phrases: { pool: () => window.PHRASES,     title: '生活短语' },
  preps:   { pool: () => (window.PREPOSITIONS || []).map(x => ({ w: x.w, m: [x.rule] })), title: '介词规则' },
};
const POS_PREFIX = /^(n\.|v\.|vt\.|vi\.|adj\.|adv\.|pron\.|prep\.|conj\.|num\.|int\.|art\.)\s*/;
const POS_CN = { 'n.': '名词', 'v.': '动词', 'vt.': '及物动词', 'vi.': '不及物动词', 'vp.': '介词动词', 'adj.': '形容词',
  'adv.': '副词', 'pron.': '代词', 'prep.': '介词', 'conj.': '连词', 'num.': '数词',
  'int.': '感叹词', 'art.': '冠词' };
const NEW_BATCH = 10;      // 新学模式：每学 10 个词插入一轮小组测试

/* ───────────── 状态 ───────────── */
let state = null;          // 持久化
let part = 'words';        // 当前板块
let session = null;        // 当前学习场次
let voices = [];

/* ═══════════ 工具函数 ═══════════ */
function todayStr(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(str, n) {
  const d = new Date(str + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return todayStr(d);
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function $ (id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function toast(msg, ms = 1800) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), ms);
}

/* ═══════════ 持久化 ═══════════ */
function defaultSettings() {
  return {
    newWords: 300, revWords: 750,      // 单词：每日新学 / 复习上限（300×2.5=750）
    newPhrases: 100, revPhrases: 250,  // 短语：每日新学 / 复习上限
    newPreps: 2, revPreps: 5,          // 介词规则：每日新学 / 复习上限（100×2.5=250）
    consPool: 'todayNew', consQ: 'e2c', consSize: 15,  // 巩固练习：范围/题型/每组个数
    quizMode: 'e2c',                     // 测验题型：新学小测/每日复习/错题重做 通用
    teachBlind: false,                   // 新学学习卡隐藏英文（纯听音+中文训练）
    zhBlind: false,                      // 听中文题型隐藏汉字（纯听音训练）
    chunkHint: false,                    // 组合拼写常显中文提示（zhBlind 遮罩对本题型豁免，v6.23）
    autoNextOk: 0.75, autoNextWrong: 1.5,  // 答对/答错反馈后自动翻页（秒）
    rate: 0.9, autoSpeak: true, voiceURI: '', zhReadSenseN: 3, pauseNewSettle: false, zhSpeakPos: true,
    zhReadFirstSense: true,              // 中文朗读精简：只读第一个词性及其释义
  };
}
function defaultPartState() {
  return { progress: {}, newCursor: 0, todayNew: 0, todayReview: 0, reviewedToday: [], cons: null, history: {} };
}
function defaultState() {
  return { version: 1, today: TODAY, settings: defaultSettings(),
           words: defaultPartState(), phrases: defaultPartState(), preps: defaultPartState() };
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    const m = Object.assign(defaultState(), s, {
      settings: Object.assign(defaultSettings(), s.settings || {}),
      words: Object.assign(defaultPartState(), s.words || {}),
      phrases: Object.assign(defaultPartState(), s.phrases || {}),
    });
    // 迁移1：清理曾被巩固练习污染的「今日复习」池（练习不算复习）
    if (!s.migRev2) {
      m.words.reviewedToday = [];
      m.phrases.reviewedToday = [];
      m.migRev2 = 1;
    }
    // 强制更新每日新学量（用户要求 300 词 / 100 短语）
    if (!s.migCounts) {
      m.settings.newWords = 300;
      m.settings.newPhrases = 100;
      m.migCounts = 1;
    }
    // 迁移2：旧版扁平巩固轮次 → 按题型轨道（保留已练进度）
    const convertCons = (c) => {
      if (!c || c.date !== TODAY || c.tracks || !c.qtype) return c || null;
      const done = c.total - (c.remaining ? c.remaining.length : 0);
      const tr = { total: c.total || 0, done, remaining: c.remaining || [], words: c.words || c.remaining || [] };
      return { date: c.date, size: c.total || 0, tracks: { [c.qtype]: tr } };
    };
    m.words.cons = convertCons(s.words && s.words.cons);
    m.phrases.cons = convertCons(s.phrases && s.phrases.cons);
    return m;
  } catch (e) { return defaultState(); }
}
function save() {
  state.rev = (state.rev || 0) + 1;                  // 每次保存递增：重载时本地比服务器新（未推送的变更）→ 本地必胜
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  scheduleServerPush();                              // 同步到服务端唯一账本（防抖）
}

/* ───────────── 服务端唯一账本（多浏览器/多标签共用同一份进度） ─────────────
   用 rev 版本号防"旧标签页快照覆盖新进度"：
   推送前先比对服务器 rev —— 服务器更新（别的标签刚学过）→ 采纳服务器、放弃本次推送；
   本地不落后 → rev+1 推送。 */
let pushTimer = null;
function scheduleServerPush() {
  if (TEST_MODE) return;                             // 测试沙盒：不碰真实账本
  if (!location.origin.startsWith('http')) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushServerState, 1200);     // 防抖：答题密集时 1.2s 才推一次
}
async function pushServerState() {
  if (TEST_MODE) return;
  if (!location.origin.startsWith('http')) return;
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (r.status === 200) {
      const server = await r.json();
      if (server && server.words && (server.rev || 0) > (state.rev || 0)) {
        state = server;                              // 别的标签页学过且更新 → 采纳，不覆盖
        ensureDay();
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
        return;
      }
    }
    await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state) }).catch(() => {});
  } catch (e) { /* 推送失败不阻塞本地学习 */ }
}
async function adoptServerState() {
  if (TEST_MODE) return;                             // 测试沙盒：用独立本地存档
  if (!location.origin.startsWith('http')) return;
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (r.status === 200) {
      const server = await r.json();
      if (server && server.words && server.settings) {
        // 本地 rev 更高（离线学过还没推上去）→ 以本地为准先推服务器；否则服务器为准
        if ((state.rev || 0) > (server.rev || 0)) {
          await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state) }).catch(() => {});
        } else {
          state = server;
          ensureDay();
          localStorage.setItem(STORE_KEY, JSON.stringify(state));
        }
      }
    } else if (r.status === 404) {
      // 服务器还没有账本 → 本地这份作为初始账本上传
      await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state) }).catch(() => {});
    }
  } catch (e) { /* 服务器不在也就地学习，不影响使用 */ }
}

/* 跨天滚动：重置每日计数 */
function ensureDay() {
  if (state.today !== todayStr()) {
    TODAY = todayStr();
    state.today = TODAY;
    for (const p of ['words', 'phrases', 'preps']) {
      state[p].todayNew = 0;
      state[p].todayReview = 0;
      state[p].reviewedToday = [];
      state[p].cons = null;              // 新的一天，巩固轮次重新开始
    }
    spreadOverdue();                     // 积压超过每日上限 → 均匀摊到后续日期（v6.5）
    save();
  }
}

/* ═══════════ SRS 调度 ═══════════ */
function progOf(p, key) {
  if (!p.progress[key]) {
    p.progress[key] = { iv: 0, ease: 2.5, due: null, wrong: 0, right: 0, streak: 0, added: null };
  }
  return p.progress[key];
}
function gradeCorrect(p, key) {
  const it = progOf(p, key);
  it.right++; it.streak++;
  it.ease = Math.min(2.8, it.ease + 0.05);
  it.iv = it.iv === 0 ? 1 : Math.max(it.iv + 1, Math.min(180, Math.round(it.iv * it.ease)));
  it.due = addDays(TODAY, it.iv);
}
function gradeWrong(p, key) {
  const it = progOf(p, key);
  it.wrong++; it.streak = 0;
  it.ease = Math.max(1.3, it.ease - 0.25);
  it.iv = 1;
  it.due = addDays(TODAY, 1);          // 明天必须再来一次
}
/* 错误频率越高、掌握越差 → 排越前 */
function reviewPriority(a, b) {
  if (b.wrong !== a.wrong) return b.wrong - a.wrong;
  if (a.ease !== b.ease) return a.ease - b.ease;
  return a.due < b.due ? -1 : 1;
}
/* 今日到期（受每日上限约束） */
function dueList(p, cap) {
  return Object.keys(p.progress)
    .filter(k => p.progress[k].due && p.progress[k].due <= TODAY)
    .map(k => ({ k, ...p.progress[k] }))
    .sort(reviewPriority)
    .slice(0, cap)
    .map(x => x.k);
}
/* 今日新学队列（词书/短语库顺序推进） */
function newList(p, pool, target) {
  const out = [];
  let i = p.newCursor;
  while (i < pool.length && out.length < target) {
    const key = pool[i].w;
    if (!p.progress[key] || !p.progress[key].added) out.push(key);
    i++;
  }
  return out;
}
/* 新学模式队列：不再先出学习卡，直接按所选题型逐词作答 */
function buildNewQueue(p, pool) {
  const st = state.settings;
  const cap = pool === window.IELTS_WORDS ? st.newWords : pool === window.PHRASES ? st.newPhrases : st.newPreps;
  const keys = newList(p, pool, Math.max(0, cap - p.todayNew));
  // 新学 = 纯看卡流：每词先读中文释义再读英文，自动/手动翻页，无小测验；
  // 登记进度/游标/退款逻辑沿用（首次展示时登记）
  return keys.map(k => ({ key: k, isNew: true, mode: 'new', taught: false }));
}
/* 每日复习上限（按板块），与 buildReviewQueue 的取法保持一致 */
function dailyRevCap(part) {
  const st = state.settings;
  return part === 'words' ? st.revWords : part === 'phrases' ? st.revPhrases : st.revPreps;
}
/* 今日剩余复习额度 = 每日上限 − 今天已在「每日复习」里复习过的词数（reviewedToday 只由每日复习写入，B10） */
function revQuota(part) {
  const p = state[part];
  const done = Array.isArray(p.reviewedToday) ? p.reviewedToday.length : 0;
  return Math.max(0, (dailyRevCap(part) || 0) - done);
}
/* 跨天摊开（v6.5）：到期词超过每日上限时，按优先级保留当天额度，
   其余按同优先级顺序填进后续日期——每天最多填到上限（考虑该日已有排期），只往后推、绝不往前拉。 */
function spreadOverdue() {
  for (const part of ['words', 'phrases', 'preps']) {
    const p = state[part];
    const cap = dailyRevCap(part) || 0;
    if (cap <= 0) continue;
    const due = Object.keys(p.progress)
      .filter(k => p.progress[k].due && p.progress[k].due <= TODAY)
      .map(k => ({ k, w: p.progress[k].wrong, e: p.progress[k].ease, d: p.progress[k].due }))
      .sort((a, b) => (b.w - a.w) || (a.e - b.e) || (a.d < b.d ? -1 : 1));
    if (due.length <= cap) continue;
    const future = {};                     // 未来 60 天各日已排数量
    for (const k in p.progress) {
      const d = p.progress[k].due;
      if (d && d > TODAY && d <= addDays(TODAY, 60)) future[d] = (future[d] || 0) + 1;
    }
    let moved = 0;
    for (const { k } of due.slice(cap)) {
      let d = addDays(TODAY, 1), guard = 0;
      while ((future[d] || 0) >= cap && guard++ < 120) d = addDays(d, 1);
      p.progress[k].due = d;
      future[d] = (future[d] || 0) + 1;
      moved++;
    }
  }
}
/* 每日复习队列：严格按到期，该几个就几个，不做任何补充；受「每日剩余额度」约束（v6.5） */
function buildReviewQueue(p, pool) {
  const st = state.settings;
  const isWords = pool === window.IELTS_WORDS;
  const part = isWords ? 'words' : pool === window.PHRASES ? 'phrases' : 'preps';
  return dueList(p, revQuota(part))
    .map(k => ({ key: k, isNew: false, mode: st.quizMode || 'e2c' }));
}

/* 加练队列：当前筛选结果中的已学词，错得多的优先，受每日复习上限约束 */
function buildExtraQueue(p, pool) {
  const isWords = pool === window.IELTS_WORDS;
  const cap = isWords ? state.settings.revWords : state.settings.revPhrases;
  const mode = state.settings.quizMode || 'e2c';
  const keys = collectList()
    .filter(x => x.prog && x.prog.added)
    .map(x => ({ k: x.e.w, ...x.prog }))
    .sort(reviewPriority)
    .slice(0, cap)
    .map(x => x.k);
  return keys.map(k => ({
    key: k, isNew: false, extra: true, mode,
  }));
}

/* ───────────── 巩固练习（万词王式：今日一轮，进度持久化，可中断续练） ───────────── */
function consRoundOf(p) {
  return (p.cons && p.cons.date === TODAY && p.cons.tracks) ? p.cons : null;
}
const CONS_QTYPES = ['e2c', 'listen', 'c2e', 'spell', 'spellc', 'chunk', 'chunkMix', 'zhChunk', 'mix'];
function startConsRound(p) {
  const size = state.settings.consSize || 15;
  const pool = consPoolKeys(p);
  if (!pool.length) return null;
  const n = Math.min(size, pool.length);
  const tracks = {};
  for (const qt of CONS_QTYPES) {                 // 每个题型一条独立进度轨道
    const remaining = shuffle(pool.slice(0, n));
    tracks[qt] = { total: remaining.length, done: 0, remaining, words: remaining.slice(), pool: state.settings.consPool };
  }
  p.cons = { date: TODAY, size: n, tracks };
  save();
  return p.cons;
}
/* 今日复习池 = 今天开始时到期的那批词的固定快照，全天不变。
   与「每日复习」进度相互独立：那边复习完归零，这边仍是 257，可随时换题型重练。
   快照在当天首次取数时生成；老数据迁移时并入当天已复习的词，避免丢掉复习过的部分。 */
function todayRevKeys(p) {
  if (!p.revSnap || p.revSnap.date !== TODAY) {
    const dueWords = Object.keys(p.progress)
      .filter(k => p.progress[k].added && p.progress[k].due && p.progress[k].due <= TODAY);
    p.revSnap = { date: TODAY, keys: [...new Set([...dueWords, ...(p.reviewedToday || [])])] };
    save();
  }
  return p.revSnap.keys.slice();
}
function consPoolKeys(p) {
  const sel = state.settings.consPool;
  let keys;
  if (sel === 'todayNew') {
    keys = Object.keys(p.progress).filter(k => p.progress[k].added === TODAY);
  } else if (sel === 'todayRev') {
    keys = todayRevKeys(p);
  } else if (sel === 'prep') {
    // 每个例句只出一次，防背版
    const items = [];
    for (const r of (window.PREPOSITIONS || [])) {
      for (const sent of (r.sentences || [])) {
        items.push({ key: r.w, sent });
      }
    }
    shuffle(items);
    keys = items.map(x => x.key);
  } else if (sel === 'wrong') {
    keys = Object.keys(p.progress)
      .filter(k => p.progress[k].added && p.progress[k].wrong > 0)
      .map(k => ({ k, ...p.progress[k] }))
      .sort(reviewPriority)
      .map(x => x.k);
  } else {
    keys = Object.keys(p.progress).filter(k => p.progress[k].added);
  }
  if (sel !== 'wrong') shuffle(keys);
  return keys;
}
function buildConsolidateQueue(p) {
  const qt = state.settings.consQ;
  const tr = consRoundOf(p).tracks[qt];
  return tr.remaining.map(k => ({
    key: k, isNew: false, extra: true,
    mode: qt === 'mix' ? ['e2c', 'listen', 'c2e', 'spell', 'spellc', 'chunk', 'chunkMix', 'zhChunk'][Math.floor(Math.random() * 8)] : qt,
  }));
}

/* ═══════════ 释义与批改 ═══════════ */
function fullMeaning(entry) {
  return entry.m.map(s => {
    const mm = s.match(POS_PREFIX);
    if (mm && mm[1] === 'v.') return (/某/.test(s) ? 'vt.' : 'vi.') + s.slice(2);   // v6.21 全局词性细分：与 posTagOf 同判据（含某槽=及物）
    return s;
  }).join('；');
}
/* 词级掌握状态（万词王式标签） */
function statusOf(p, key) {
  const v = p.progress[key];
  if (!v || !v.added) return { id: 'new', label: '未学', cls: 'st-new' };
  if (v.wrong >= 3 && v.wrong > v.right) return { id: 'bad', label: '🔴 频繁出错', cls: 'st-bad' };
  if (v.due && v.due < TODAY) return { id: 'over', label: '🟠 复习逾期', cls: 'st-over' };
  if (v.iv >= 21) return { id: 'done', label: '🟢 已掌握', cls: 'st-done' };
  if (v.iv >= 3) return { id: 'mid', label: '🔵 初步掌握', cls: 'st-mid' };
  return { id: 'learning', label: '⚪ 学习中', cls: 'st-learning' };
}
/* 看义选词（c2e）：中文出题，4 个英文词选项（介词动词显示"动词 介词"整体，v6.14） */
function makeWordOptions(pool, key) {
  const entry = pool.find(e => e.w === key);
  const others = shuffle(pool.filter(e => e.w !== key && fullMeaning(e) !== fullMeaning(entry)));
  const main = enForm(entry);
  const opts = [main];
  for (const o of others) {
    if (opts.length >= 4) break;
    const t = enForm(o);
    if (!opts.includes(t)) opts.push(t);
  }
  const arr = shuffle(opts.map(t => ({ text: t, correct: t === main })));
  return { entry, options: arr };
}
/* 拼写默写批改：忽略大小写、空格与符号 */
function normEn(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
/* 介词动词（v6.14）：动词+固定介词是一个整体（abide by / listen to）。
   VP_MAP[word] = {义项下标: 介词}（data/vp_map.js，词义工程生成）。
   英文呈现（读音/显示/拼写答案）一律用 enForm = "动词 介词"；判分用 normEn（空格大小写宽松，介词必须带）。 */
function vpPrep(entry) {
  const m = window.VP_MAP && window.VP_MAP[entry.w];
  if (!m) return null;
  const ks = Object.keys(m);
  return ks.length ? m[ks[0]] : null;      // 呈现用首个 vp 义的介词（词级形式）
}
function enForm(entry) {
  const prep = vpPrep(entry);
  return prep ? entry.w + ' ' + prep : entry.w;
}
/* 看词选义：干扰项每次随机、互不相同；正确项与词书完全一致 */
function makeOptions(pool, key) {
  const entry = pool.find(e => e.w === key);
  const correctText = fullMeaning(entry);
  const others = shuffle(pool.filter(e => e.w !== key && fullMeaning(e) !== correctText));
  const opts = [correctText];
  for (const o of others) {
    if (opts.length >= 4) break;
    if (!opts.includes(fullMeaning(o))) opts.push(fullMeaning(o));
  }
  while (opts.length < 4) opts.push('——');
  const arr = shuffle(opts.map(t => ({ text: t, correct: t === correctText })));
  return { entry, options: arr };
}

/* ═══════════ TTS 朗读（浏览器内置，可开关，不用 CUDA） ═══════════ */
function initVoices() {
  voices = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
  const sel = $('setVoice');
  sel.innerHTML = '<option value="">自动（优先自然语音）</option>' +
    voices.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('');
  if (state.settings.voiceURI) sel.value = state.settings.voiceURI;
}
function pickVoice() {
  if (state.settings.voiceURI) {
    const v = voices.find(v => v.voiceURI === state.settings.voiceURI);
    if (v) return v;
  }
  return voices.find(v => /natural/i.test(v.name) && /en-US/i.test(v.lang))
      || voices.find(v => /en-US/i.test(v.lang))
      || voices.find(v => /en-GB/i.test(v.lang))
      || voices[0] || null;
}
/* ── TTS 朗读队列 ──
 * 不用 cancel+延迟播（会被浏览器静默吞声，且要求用户卡时间）。
 * 改为排队逐条播：翻卡多快都有声，只保留最新 3 条防止堆积；
 * 🔊 手动重听才打断当前、立即插播。 */
const speechQueue = [];
let ttsBusy = false;
let lastUtterance = null;   // 持有引用，防止浏览器把utterance回收导致无声
let lastAudio = null;       // 当前播放的预生成音频
const preloadedAudio = new Set();

/* 符号型词条的朗读别名（避免合成器读出「点/斜杠」之类的怪声） */
const TTS_ALIAS = {
  'Mrs.': 'Misses', 'Mr.': 'Mister', 'i.e.': 'that is', 'e.g.': 'for example',
  'etc.': 'etcetera', 'A.M.': 'A M', 'p.m.': 'P M', 'o.k.': 'OK', 'No.': 'Number',
  'c/o': 'care of', 'b/l': 'B L', 'l/c': 'L C', 'A.D.': 'A D', 'B.C.': 'B C',
  'ms.': 'manuscript',
};
/* 朗读前的文本清洗：下划线/符号读不出人话，统一替换或剔除 */
function spokenForm(text) {
  if (TTS_ALIAS[text]) return TTS_ALIAS[text];
  return String(text).replace(/_/g, ' ')
    .replace(/[^a-zA-Z0-9' \-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
let replayTimer = null;
let queueDrainCb = null;   // 播放队列排空后的回调（看卡自动翻页用）

function speak(item, append) {             // 排队播；append=true 不清队列（强化朗读后接题面读音，与 speakSeq 同语义）
  if (!('speechSynthesis' in window) || !item || !state.settings.autoSpeak) return;
  if (!append) speechQueue.length = 0;     // v6.36 修复：append 此前是死参数（无条件清队列），强化段未播完即被下一题作废
  speechQueue.push(item);
  pumpSpeech();
}
let busySince = 0;
let busyHangs = 0;                         // 连续硬超时计数：自然播放完成即清零；连续≥2 视为整条音频通道假死
let recoveryToastShown = false;
function dismissRecoveryToast() {
  const t = document.getElementById('audioRecoveryToast');
  if (t) t.classList.remove('show');
  recoveryToastShown = false;
}
function showRecoveryToast() {             // 音频通道整体假死的兜底：一键刷新恢复（不自动刷新，防打断作答）
  if (recoveryToastShown) return;
  recoveryToastShown = true;
  let t = document.getElementById('audioRecoveryToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'audioRecoveryToast';
    t.innerHTML = '<div class="art-title">🔊 音频通道疑似卡死</div>' +
      '<div class="art-sub">已自动复活仍无声 → 点下面按钮刷新恢复（进度已实时保存，放心点）</div>' +
      '<button id="artReload">🔄 一键恢复声音</button>';
    document.body.appendChild(t);
    t.querySelector('#artReload').onclick = () => location.reload();
  }
  requestAnimationFrame(() => t.classList.add('show'));
}
setInterval(() => {                        // 音频看门狗：忙标志卡死（合成假死/播放挂起）自动复活
  if (!ttsBusy || document.hidden) return; // 后台标签计时器被节流，不在后台做复位判断（防误杀正常播放）
  const playing = (speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending))
    || (lastAudio && !lastAudio.paused && !lastAudio.ended);
  const age = Date.now() - busySince;
  if (!playing && age > 3000) {
    playToken++;
    ttsBusy = false;
    // B32 加固：play() 挂起不启动的死法（paused 卡 true、不报错）走这条——45s 硬路径永远进不去，
    // 旧版只复位不拆源不计数 → 状态机"看似健康"实际全哑且永不弹恢复提示。现在同样拆源+计数。
    try { speechSynthesis.cancel(); } catch (e) {}
    if (lastAudio) { try { lastAudio.pause(); } catch (e) {} lastAudio = null; }
    busyHangs++;
    pumpSpeech();
    if (!ttsBusy && !speechQueue.length && queueDrainCb) {
      const cb = queueDrainCb; queueDrainCb = null;
      setTimeout(cb, 60);
    }
    if (busyHangs >= 2) showRecoveryToast();
  } else if (age > 45000) {                // 硬超时：引擎假死时会"自报在播"（pending 卡 true / 音频元素不 ended），
                                           // 上面 3s 路径永远不触发 → 不信任自报状态，超时强制复位并拆掉卡死源
    playToken++;
    ttsBusy = false;
    try { speechSynthesis.cancel(); } catch (e) {}
    if (lastAudio) { try { lastAudio.pause(); } catch (e) {} lastAudio = null; }
    busyHangs++;
    pumpSpeech();
    if (!ttsBusy && !speechQueue.length && queueDrainCb) {
      const cb = queueDrainCb; queueDrainCb = null;   // 被掐断的是队尾 → 补发排空回调（看卡自动翻页）
      setTimeout(cb, 60);
    }
    if (busyHangs >= 2) showRecoveryToast();
  }
}, 1500);
/* play() 挂起看护（B32）：Chrome 媒体管线耗尽时 play() 的 Promise 永久 pending 且不报错、
   paused 卡 true——3 秒未真正启动即按失败处理：作废回调、拆源防泄漏、失败计数（连续 2 次弹一键恢复） */
function playGuard(tok, a) {
  setTimeout(() => {
    if (tok !== playToken) return;          // 已被后续播放/停播作废
    if (!a.paused || a.ended) return;       // 已启动或已自然结束 → 交给 ended/onpause
    playToken++;
    try { a.pause(); a.src = ''; } catch (e) {}
    if (lastAudio === a) lastAudio = null;
    busyHangs++;
    ttsBusy = false;
    pumpSpeech();
    if (!ttsBusy && !speechQueue.length && queueDrainCb) {
      const cb = queueDrainCb; queueDrainCb = null;   // v6.36：被拆的是链尾件时 done 永不触发 → 补发排空回调（看卡自动翻页）
      setTimeout(cb, 60);
    }
    if (busyHangs >= 2) showRecoveryToast();
  }, 3000);
}
function pumpSpeech() {
  if (ttsBusy || !speechQueue.length) return;
  ttsBusy = true;
  busySince = Date.now();
  const q = speechQueue.shift();
  const tok = ++playToken;
  const done = () => {
    if (tok !== playToken) return;         // 旧播放的迟到回调 → 作废（否则会提前放行下一条，中英重叠）
    busyHangs = 0;                         // 自然完成 → 连续假死计数清零，收起恢复提示
    dismissRecoveryToast();
    ttsBusy = false;
    pumpSpeech();
    if (!ttsBusy && !speechQueue.length && queueDrainCb) {
      const cb = queueDrainCb; queueDrainCb = null;
      setTimeout(cb, 60);
    }
  };
  // 中文合成项（看卡流程"先中文后英文"的混排队列用；v6.36 起 speakZh 也走此分支）
  if (q && typeof q === 'object' && q.zh) {
    const u = new SpeechSynthesisUtterance(q.zh);
    const v = voices.find(v => /^zh/i.test(v.lang));
    if (v) u.voice = v;
    u.lang = 'zh-CN'; u.rate = 0.9;
    lastUtterance = u;   // 持引用防回收（与英文合成分支同纪律，见 471 行注释）
    u.onend = done; u.onerror = done;
    speechSynthesis.speak(u);
    return;
  }

  // ⓪ 直接指定音频文件（如中文释义 MP3）
  if (q && typeof q === 'object' && q.src) {
    try {
      const a = new Audio(q.src);
      lastAudio = a;
      a.onended = done;
      a.onerror = done;
      a.onpause = done;   // 被 stopAllAudio 暂停的音频永远不会触发 ended → 忙标志卡死、后续朗读全哑
      const pr = a.play();
      if (pr && pr.catch) pr.catch(done);
      playGuard(tok, a);  // play 挂起 3s 未启动 → 拆源+失败计数（B32）
      return;
    } catch (e) { /* 失败则继续下一条 */ }
  }
  const text = typeof q === 'string' ? q : (q && q.text) || '';

  // ① 优先播放预生成本地读音（零延迟、Edge 神经音色）
  const src = window.AUDIO_INDEX && window.AUDIO_INDEX[text];
  if (src) {
    try {
      const a = new Audio(src);
      lastAudio = a;
      a.onended = done;
      a.onerror = done;
      a.onpause = done;   // 同 ⓪：暂停路径也要释放忙标志
      const pr = a.play();
      if (pr && pr.catch) pr.catch(done);
      playGuard(tok, a);  // play 挂起 3s 未启动 → 拆源+失败计数（B32）
      return;
    } catch (e) { /* 本地音频失败则落到浏览器合成 */ }
  }

  // ② 浏览器内置合成（有生成延迟，仅作为未缓存词条的兜底）
  try {
    const u = new SpeechSynthesisUtterance(spokenForm(text));
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-US'; }
    u.rate = state.settings.rate;
    lastUtterance = u;
    const done2 = () => {
      if (tok !== playToken) return;
      busyHangs = 0;
      dismissRecoveryToast();
      ttsBusy = false;
      pumpSpeech();
      if (!ttsBusy && !speechQueue.length && queueDrainCb) {
        const cb = queueDrainCb; queueDrainCb = null;   // v6.36：合成文本是链尾件（AUDIO_INDEX 未命中）→ 补发排空回调
        setTimeout(cb, 60);
      }
    };
    u.onend = done2;
    u.onerror = done2;
    if (speechSynthesis.paused) speechSynthesis.resume();
    speechSynthesis.speak(u);
    // 保险：个别浏览器把 speak 吞掉时 onend/onerror 都不触发，400ms 后跳过这条继续
    setTimeout(() => {
      if (tok !== playToken) return;
      if (ttsBusy && !speechSynthesis.speaking && !speechSynthesis.pending) {
        ttsBusy = false;
        pumpSpeech();
        if (!ttsBusy && !speechQueue.length && queueDrainCb) {
          const cb = queueDrainCb; queueDrainCb = null;   // v6.36：被跳过的是链尾件 → 补发排空回调
          setTimeout(cb, 60);
        }
      }
    }, 400);
  } catch (e) {
    ttsBusy = false;
    pumpSpeech();
    if (!ttsBusy && !speechQueue.length && queueDrainCb) {
      const cb = queueDrainCb; queueDrainCb = null;   // v6.36：同类遗漏兜底——构造抛异常也是提前终结链尾件
      setTimeout(cb, 60);
    }
  }
}
function splitWordChunks(word) {
  const m = window.CHUNK_MAP && window.CHUNK_MAP[word];
  if (m && m.length) return m.map(c => Array.isArray(c) ? c[0] : c);   // 词根词缀表 [[块,义],…]（v6.19）取块文本；兼容旧字符串块；缺词回落机械切
  if (word.length <= 3) return [word];
  const n = Math.min(4, Math.max(2, Math.floor(word.length / 3)));
  const size = Math.ceil(word.length / n);
  const chunks = [];
  for (let i = 0; i < word.length; i += size) chunks.push(word.slice(i, i + size));
  return chunks;
}
/* v6.19 纠错展示：正确答案按词根词缀分解显示，每块下带大致中文义（CHUNK_MAP [[块,义],...]）；
   单块词 / vp 词（enForm 含空格整体呈现）/ 未命中词 → 回落整词大字（B16 三件套语义不变） */
function fbWordHtml(entry) {
  const w = enForm(entry);
  const m = window.CHUNK_MAP && window.CHUNK_MAP[entry.w];
  if (w === entry.w && m && m.length > 1) {
    return '<div class="fb-chunks">' + m.map(c => {
      const t = Array.isArray(c) ? c[0] : c, g = Array.isArray(c) ? (c[1] || '') : '';
      return '<div class="fb-chunk"><div class="fb-chunk-b">' + esc(t) + '</div>' +
        (g ? '<div class="fb-chunk-g">' + esc(g) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  return '<div class="fb-correct-word">' + esc(w) + '</div>';
}
/* 意象组合：把中文释义按词性拆成意象模块（"n. 电报机，电报" / "v. 打电报，发电报" 各一块）。
   先按 m 数组元素，再把元素内跟在分号后的新词性拆开，非词性开头的碎片并回前块。 */
/* 意象组合/中文朗读：把释义按词性拆成模块（含"紧贴中文"的词性标记也能切开） */
/* 意象组合/中文朗读：把释义按词性拆成模块（含"紧贴中文"、全角句点 n．、缩写标记等形态） */
function splitMeaningModules(entry) {
  const RE = /(?<![a-zA-Z0-9(])(vt|vi|adj|ad|aux|a|adv|pron|prep|conj|num|int|art|pl|sb|sth|n|v)[.．]\s*|(?<![a-zA-Z0-9(])缩(?=[^a-zA-Z]*[一-鿿])/g;
  const out = [];
  for (const raw of (entry.m || [])) {
    const s = String(raw);
    const marks = [...s.matchAll(RE)].map(m => ({ idx: m.index, text: m[0] }));
    if (!marks.length) { const t = s.trim(); if (t) out.push(t); continue; }
    let head = s.slice(0, marks[0].idx).trim();
    for (let i = 0; i < marks.length; i++) {
      const segStart = marks[i].idx + marks[i].text.length;
      const segEnd = i + 1 < marks.length ? marks[i + 1].idx : s.length;
      const body = s.slice(segStart, segEnd).replace(/;\s*$/, '').trim();
      const piece = ((head ? head + ' ' : '') + marks[i].text.replace(/\s+$/, '') + ' ' + body).trim();
      if (piece) out.push(piece);
      head = '';
    }
  }
  return out.length ? out : [fullMeaning(entry)];
}
/* 多重集合相等（意象组合判分：顺序无关，块须完全一致） */
function sameModules(a, b) {
  if (a.length !== b.length) return false;
  const rest = b.slice();
  for (const x of a) {
    const i = rest.indexOf(x);
    if (i < 0) return false;
    rest.splice(i, 1);
  }
  return true;
}
function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

let playToken = 0;                        // 播放令牌：停播时作废所有在途回调，防旧卡回调错误放行新卡（中英重叠根因）
function stopAllAudio() {                  // 提交/揭示时立即停掉一切朗读，保持节奏
  playToken++;
  queueDrainCb = null;                     // 同时取消挂起的自动翻页（手动接管）
  speechQueue.length = 0;
  if (lastAudio) { try { lastAudio.pause(); } catch (e) {} lastAudio = null; }
  speechSynthesis.cancel();
  ttsBusy = false;
  clearTimeout(replayTimer);
}
function replaySpeak(item) {               // 🔊 手动重听：清空队列、打断当前、立即播
  if (!('speechSynthesis' in window) || !item) return;
  stopAllAudio();
  replayTimer = setTimeout(() => {
    if (item && typeof item === 'object') {
      if (item.seq) speakSeq(item.seq);                   // 逐义项音频序列（词义库 v2）
      else if (item.src) speak({ src: item.src });        // 指定音频（听中文题型的中文 MP3）
      else if (item.zhText) speakZh(item.zhText);         // 中文合成兜底
    } else speak(item);
  }, 60);                                            // cancel 后稍候入队，避免吞声
}
function autoSpeak(item, append) { if (state.settings.autoSpeak) speak(item, append); }
/* 中文朗读文本消毒：词性标记转中文词性名（否则 TTS 会把 v./int./pl. 读成英文字母） */
const ZH_POS_CN = { 'n.': '名词，', 'v.': '动词，', 'vt.': '及物动词，', 'vi.': '不及物动词，', 'vp.': '介词动词，',
  'adj.': '形容词，', 'adv.': '副词，', 'pron.': '代词，', 'prep.': '介词，', 'conj.': '连词，',
  'num.': '数词，', 'int.': '感叹词，', 'art.': '冠词，', 'pl.': '复数，', 'sb.': '某人，', 'sth.': '某物，',
  'a.': '形容词，', 'ad.': '副词，', 'aux.': '助动词，' };
function sanitizeZhText(t) {
  let s = String(t || '')
    .replace(/\([a-zA-Z][^)]*\)/g, '')          // 英文括注 (by) 等整段去掉
    .replace(/=[A-Za-z].*$/, '')                  // 行内英文对译（=Cost…）截断
    .replace(/[()（）]/g, '');
  s = s.replace(/(?<![a-zA-Z0-9(])(vt|vi|adj|ad|aux|a|adv|pron|prep|conj|num|int|art|pl|sb|sth|n|v)[.．]\s*/g,
    (m, tag) => ZH_POS_CN[tag + '.'] || '');
  s = s.replace(/;\s*/g, '，').replace(/[/／]/g, '、');
  s = s.replace(/\s+/g, ' ').replace(/^[\s，,;；]+/, '').trim();
  return s || String(t || '');
}
/* 中文朗读文本：词义库 v2（v6.9）——m = ["n. 义项","v. 义项",...] 按使用频率降序、跨词性交叉。
   取前 N 个义项（zhReadSenseN，默认 3；精简开关不勾 = 读全部）；
   播报规则：词性变化才报词性名，连续同词性连读义项不重复报（用户规格）。 */
function zhReadSeq(entry) {
  const ms = (entry && entry.m) || [];
  const useAll = state.settings.zhReadFirstSense === false;
  const N = Math.max(1, parseInt(state.settings.zhReadSenseN, 10) || 3);
  return (useAll ? ms : ms.slice(0, N)).map(m => {
    const g = /^(n|v|vt|vi|vp|adj|adv|prep|conj|pron|aux|int|art|num)[.．]\s*(.+)$/.exec(String(m));
    return g ? { pos: g[1], sense: g[2] } : { pos: null, sense: String(m) };
  });
}
/* 播报词性细分（v6.15）：v. 不再笼统报"动词"——带某槽 → 及物动词，无槽 → 不及物动词；
   vt/vi/vp 及其余词性原样。槽位检测与数据层规则同源（某 = 槽）。 */
function effPosKey(it) {
  if (it.pos === 'v') return /某/.test(it.sense) ? 'vt' : 'vi';
  return it.pos;
}
/* v6.20 显示词性细分：v. 按槽位显示 vt./vi.（与朗读 effPosKey 同判据：释义含"某"=及物），
   看卡释义与答案页统一，不再显示纯 v. */
function posTagOf(raw) {
  const mm = raw.match(POS_PREFIX);
  if (!mm) return '';
  if (mm[1] === 'v.') return /某/.test(raw) ? 'vt.' : 'vi.';
  return mm[1];
}
function zhSpeakText(entry) {
  const seq = zhReadSeq(entry);
  if (!seq.length) return sanitizeZhText(fullMeaning(entry));
  const noPos = state.settings.zhSpeakPos === false;
  let out = '', lastPos = null;
  for (const it of seq) {
    const pk = effPosKey(it);
    if (!noPos && pk && pk !== lastPos) { out += (out ? '，' : '') + (ZH_POS_CN[pk + '.'] || ''); lastPos = pk; }
    out += (out && !/[，]$/.test(out) ? '，' : '') + sanitizeZhText(it.sense);
  }
  return out || sanitizeZhText((entry.m || []).join('，'));
}
/* 统一音色：中文一律优先预生成 MP3（小晓），无缓存才退回合成 */
function zhAudioFor(entry) {
  return (window.AUDIO_ZH && window.AUDIO_ZH[entry.w]) || null;
}
/* 预生成中文缓存是否可用：释义正文里还嵌着词性标记 → 缓存读音是坏的（把标记读成英文），跳过用合成 */
function zhCacheOk(entry) {
  const m0 = (entry.m && entry.m[0]) || '';
  const body = m0.replace(POS_PREFIX, '');
  return !/(?<![a-zA-Z0-9])(vt|vi|adj|a|adv|pron|prep|conj|num|int|art|pl|sb|sth|n|v)\.\s*/.test(body);
}
function speakSrc(src, append) { if (src && state.settings.autoSpeak) speak({ src }, append); }
/* 词义库 v2 中文连播管线（v6.9，v6.34 抽公用）：逐义项 MP3+词性名按前 N 义组合连播，
   未生成完的词整体退回合成；返回 replayItem 形态（{seq}/{zhText}）。
   renderQuestion 的听中文组题面与 applyResult 的 chunkMix 英文向中文强化共用（B23 成对改纪律：两处只此一份实现） */
function playZhSeqFor(entry, appendAudio) {
  const zhText = zhSpeakText(entry);
  const seq = zhReadSeq(entry);
  const noPos = state.settings.zhSpeakPos === false;
  const q = [];
  let lastPos = null, missing = false;
  for (const it of seq) {
    const pk = effPosKey(it);                     // 音频段词性与朗读同套细分（v6.15）
    if (!noPos && pk && pk !== lastPos) {
      const psrc = window.AUDIO_POS && window.AUDIO_POS[pk + '.'];
      if (!psrc) { missing = true; break; }
      q.push({ src: psrc });
    }
    lastPos = pk;
    const ssrc = window.AUDIO_SENSE && window.AUDIO_SENSE[it.sense];
    if (!ssrc) { missing = true; break; }
    q.push({ src: ssrc });
  }
  if (!missing && q.length) { speakSeq(q, appendAudio); return { seq: q }; }
  speakZh(zhText, appendAudio);   // v6.36：合成兜底同样尊重 appendAudio——强化在播时追加而非叠音
  return { zhText };
}
/* 逐义项队列连播（v6.9 词义库 v2）：按 N 组合的音频序列一次入队（N 改动即时生效） */
function speakSeq(items, append) {
  if (!('speechSynthesis' in window) || !items || !items.length || !state.settings.autoSpeak) return;
  if (!append) speechQueue.length = 0;
  for (const it of items) speechQueue.push(it);
  pumpSpeech();
}
/* 中文朗读（听中文写词题型未命中缓存时的合成兜底）。
   v6.36 修复：旧实现旁路队列与播放令牌直接开口——强化音频在播时双通道叠音、
   done 回调无令牌守卫（stopAllAudio 后迟到的 interrupted 回调会掐掉新播的看门狗监护）。
   现统一入队 {zh:text} 走 pumpSpeech 的中文分支，令牌/看门狗/排空回调全走既有纪律（F2/F3） */
function speakZh(text, append) {
  if (!('speechSynthesis' in window) || !text || !state.settings.autoSpeak) return;
  if (!append) speechQueue.length = 0;
  speechQueue.push({ zh: text });
  pumpSpeech();
}
/* 词的首个释义（词性 + 中文），听中文写词题型的题干 */
function firstSense(entry) {
  const m = (entry.m && entry.m[0]) || '';
  const mm = m.match(POS_PREFIX);
  return {
    pos: mm ? mm[1] : '',
    posCN: mm ? (POS_CN[mm[1]] || '') : '',
    text: m.replace(POS_PREFIX, ''),
  };
}
/* 题面/提示显示：与朗读完全同源（zhReadSeq 前 N 义、同分组同顺序）——读多少就显示多少（v6.10）
   格式："名词 · 意思是，打算；形容词 · 吝啬的"（同词性一组，词性变化分组） */
function zhReadDisplay(entry) {
  const seq = zhReadSeq(entry);
  if (!seq.length) return fullMeaning(entry);
  const parts = [];
  let lastPos = null, cur = null;
  for (const it of seq) {
    const pk = effPosKey(it);                      // 显示与朗读同一套细分词性（v6.15）
    if (pk !== lastPos) {
      if (cur) parts.push(cur);
      cur = { pos: pk ? (POS_CN[pk + '.'] || pk) : '', senses: [] };
      lastPos = pk;
    }
    cur.senses.push(it.sense);
  }
  if (cur) parts.push(cur);
  return parts.map(p => (p.pos ? p.pos + ' · ' : '') + p.senses.join('，')).join('；');
}

/* ───────────── GSAP 微动效（v6.29）─────────────
 * 红线：单段动效 ≤0.35s、无循环；gsap 缺失或系统开启「减少动态效果」时静默跳过，功能不受影响。
 * 芯片数字等高频刷新位刻意不加动效，避免干扰答题节奏。 */
const REDUCE_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function fxRun(fn) {                      // 统一闸门：无 gsap / 减动效偏好 → 什么都不做
  if (REDUCE_MOTION || !window.gsap || typeof window.gsap.to !== 'function') return;
  try { fn(window.gsap); } catch (e) { /* 动效异常不干扰答题 */ }
}

/* ═══════════ 视图切换 ═══════════ */
function showView(name) {
  for (const v of ['homeView', 'sessionView', 'doneView', 'listView']) $(v).classList.add('hidden');
  $(name).classList.remove('hidden');
  fxRun(g => g.fromTo('#' + name, { autoAlpha: 0, y: 14 },
    { autoAlpha: 1, y: 0, duration: 0.25, ease: 'power1.out', overwrite: 'auto', clearProps: 'all' }));
}
function switchPart(p) {
  part = p;
  $('tabWords').classList.toggle('active', p === 'words');
  $('tabPhrases').classList.toggle('active', p === 'phrases');
  $('tabPreps').classList.toggle('active', p === 'preps');
  $('tabPreps').classList.toggle('active', p === 'preps');
  renderHome();
}

/* ═══════════ 首页渲染 ═══════════ */
function streakDays(p) {
  let n = 0;
  let d = p.history[todayStr()] ? TODAY : addDays(TODAY, -1);
  if (d !== TODAY && !p.history[d]) return 0;
  while (p.history[d] && p.history[d].tot > 0) { n++; d = addDays(d, -1); }
  return n;
}
function renderHome() {
  const p = state[part];
  const pool = PARTS[part].pool();
  const isWords = part === 'words';
  const revCap = isWords ? state.settings.revWords : state.settings.revPhrases;
  const newCap = isWords ? state.settings.newWords : state.settings.newPhrases;

  $('planTitle').textContent = `今日任务 · ${PARTS[part].title}`;
  $('todayDate').textContent = TODAY;
  const quota = revQuota(part);              // 每日剩余额度（v6.5）
  const dueN = dueList(p, quota).length;
  const totalDue = dueList(p, revCap).length;
  const newN = newList(p, pool, Math.max(0, newCap - p.todayNew)).length;
  $('numReview').textContent = dueN;
  $('numNew').textContent = newN;
  $('capReview').textContent = `上限 ${revCap}`;
  $('capNew').textContent = `上限 ${newCap}`;
  $('numStreak').textContent = streakDays(p);

  // 双入口按钮
  const learned = Object.keys(p.progress).length;
  const bookDone = p.newCursor >= pool.length && newN === 0;
  const unit = isWords ? '个' : '条';
  $('subNew').textContent = newN > 0 ? `今日 ${newN} ${unit}` : (bookDone ? (isWords ? '词书已学完 🎓' : '待 AI 补充新短语') : '今日已完成');
  $('btnStartNew').disabled = newN === 0;
  if (learned > 0 && quota === 0 && totalDue > 0) {
    $('subReview').textContent = `今日额度已用完 ✓ 剩 ${totalDue} 个明天继续`;
    $('btnStartReview').disabled = true;
  } else {
    $('subReview').textContent = learned === 0 ? '暂无可复习' : `今日 ${dueN} 个`;
    $('btnStartReview').disabled = dueN === 0;
  }

  $('planTip').textContent = isWords
    ? (learned === 0
        ? '先去「新学模式」学第一批词；从明天起「每日复习」会自动安排错得多的词。'
        : `新学 = 看卡模式：每词自动读中文再读英文，读完自动翻页，也可点按钮或回车手动翻；复习只安排今天真正到期的词。`)
    : '介词规则库由 AI 持续新增，每天学 2 条规则。';
  // 词库进度
  const mastered = Object.values(p.progress).filter(x => x.iv >= 21).length;
  $('progFill').style.width = (learned / pool.length * 100).toFixed(1) + '%';
  $('progText').textContent = `已学 ${learned} / ${pool.length}`;
  $('miniStats').innerHTML =
    `<span class="mini-tag">掌握 <b>${mastered}</b></span>` +
    `<span class="mini-tag">学习中 <b>${learned - mastered}</b></span>` +
    `<span class="mini-tag">累计出错 <b>${Object.values(p.progress).reduce((s, x) => s + x.wrong, 0)}</b></span>`;

  // 近 7 天
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(TODAY, -6 + i);
    days.push({ d, h: p.history[d] || { n: 0, r: 0, ok: 0, tot: 0 } });
  }
  const maxAct = Math.max(1, ...days.map(x => x.h.n + x.h.r));
  $('weekList').innerHTML = days.map(({ d, h }) => {
    const act = h.n + h.r;
    const acc = h.tot ? Math.round(h.ok / h.tot * 100) + '%' : '—';
    return `<div class="week-row"><span class="d">${d.slice(5)}</span>
      <div class="bar-wrap"><div class="bar" style="width:${act / maxAct * 100}%"></div></div>
      <span class="acc">${acc}</span></div>`;
  }).join('');
  // 测验题型选中态
  document.querySelectorAll('#modeRow .cchip').forEach(c =>
    c.classList.toggle('active', c.dataset.mode === (state.settings.quizMode || 'e2c')));
  renderCons(p);
}

/* ───────────── 巩固练习卡片 ───────────── */
function consCounts(p) {
  return {
    todayNew: Object.keys(p.progress).filter(k => p.progress[k].added === TODAY).length,
    todayRev: todayRevKeys(p).length,   // 与实际练习池同源：复习完不掉出数量
    wrong: Object.keys(p.progress).filter(k => p.progress[k].wrong > 0).length,
    all: Object.keys(p.progress).filter(k => p.progress[k].added).length,
    prep: (window.PREPOSITIONS || []).length,
  };
}
function renderCons(p) {
  const s = state.settings;
  const counts = consCounts(p);
  const countOf = { todayNew: counts.todayNew, todayRev: counts.todayRev, wrong: counts.wrong, all: counts.all, prep: counts.prep };
  const isPhrases = part === 'phrases';
  const round = consRoundOf(p);

  // 范围/每组芯片：显示池子数量 + 选中态
  const rows = [['consPoolRow', s.consPool], ['consSizeRow', String(s.consSize)]];
  for (const [rowId, cur] of rows) {
    document.querySelectorAll(`#${rowId} .cchip`).forEach(c => {
      const v = c.dataset.v;
      c.classList.toggle('active', v === cur);
      if (c.dataset.label) c.textContent = (c.dataset.label + ' ' + (countOf[v] != null ? countOf[v] : '')).trim();
    });
  }
  // 题型芯片：显示各题型自己的进度几杠几
  document.querySelectorAll('#consQRow .cchip').forEach(c => {
    const qt = c.dataset.v;
    c.classList.toggle('active', qt === s.consQ);
    let label = c.dataset.label;
    if (isPhrases) label = label.replace('看词', '看短语').replace('选词', '选短语');
    const tr = round ? round.tracks[qt] : null;
    c.textContent = tr ? `${label} ${tr.done}/${tr.total}` : label;
  });

  const btn = $('btnConsStart');
  const prog = $('consProgress');

  // 本轮存在：进度条显示当前所选题型的几杠几，按钮=继续/重学
  if (round) {
    // 迁移后的旧轮次可能缺某个题型的轨道：按空轨道兜底（点开始时会现场创建）
    const tr = round.tracks[s.consQ] || { total: 0, done: 0, remaining: [] };
    const doneN = tr.total - tr.remaining.length;
    prog.classList.remove('hidden');
    $('consProgText').textContent = `今日巩固 ${doneN}/${tr.total}（当前题型）`;
    $('consProgLeft').textContent = tr.remaining.length ? `剩 ${tr.remaining.length} 个` : '本轮完成';
    $('consProgFill').style.width = (doneN / tr.total * 100) + '%';
    btn.disabled = false;
    btn.textContent = tr.remaining.length ? `继续巩固 · ${doneN}/${tr.total}`
      : (tr.done > 0 ? `本轮已完成 · 重新学一遍这 ${tr.total} 个词？` : '开始巩固');
    return;
  }

  // 尚无轮次：显示可练数量
  prog.classList.add('hidden');
  const avail = countOf[s.consPool] || 0;
  btn.disabled = avail === 0;
  btn.textContent = avail === 0 ? '这个词范围还没有可练的词'
    : `开始巩固 · 每组 ${s.consSize} 个（可练 ${avail} 个）`;
}
/* 每日复习完成 → 自动划入新一批新学词（用户无需手动看卡/测验）；可在设置里暂停推进 */
function autoSettleNew() {
  if (state.settings.pauseNewSettle) return 0;   // 暂停新词推进（用户开关，v6.11）
  let total = 0;
  for (const part of ['words', 'phrases', 'preps']) {
    const p = state[part];
    const pool = PARTS[part].pool();
    const cap = pool === window.IELTS_WORDS ? state.settings.newWords
      : pool === window.PHRASES ? state.settings.newPhrases : state.settings.newPreps;
    const avail = Math.max(0, cap - (p.todayNew || 0));
    if (avail <= 0) continue;
    const keys = newList(p, pool, avail);
    for (const k of keys) {
      const prog = progOf(p, k);
      prog.added = TODAY;
      prog.iv = 1; prog.ease = 2.5;
      prog.due = addDays(TODAY, 1);
      let c = p.newCursor;
      while (c < pool.length && pool[c].w !== k) c++;
      p.newCursor = Math.min(pool.length, c + 1);
      total++;
    }
    p.todayNew = (p.todayNew || 0) + keys.length;
  }
  if (total) {
    save();
    toast(`今日复习完成 ✓ 已自动划入 ${total} 个新词（明日复习）`);
  }
  return total;
}

/* ═══════════ 场次控制 ═══════════ */
let nextTimer = null;                // 答错反馈后的自动翻页
function autoNextMs(ok, mode) {        // 自动翻页时长（毫秒），设置里可改
  const s = state.settings;
  let sec = ok ? (s.autoNextOk || 0.75) : (s.autoNextWrong || 1.5);
  if (!ok) sec = Math.max(sec, 1.2);   // 答错的纠错展示至少 1.2 秒
  return Math.max(300, sec * 1000);
}
function scheduleNext(ms) {
  clearTimeout(nextTimer);
  nextTimer = setTimeout(() => { nextTimer = null; if (session && session.answered) nextQuestion(); }, ms);
}
function clearNextTimer() { clearTimeout(nextTimer); nextTimer = null; }

function startSession(kind) {
  ensureDay();
  clearNextTimer();
  const p = state[part];
  const pool = PARTS[part].pool();
  const queue = kind === 'new' ? buildNewQueue(p, pool)
    : kind === 'extra' ? buildExtraQueue(p, pool)
    : kind === 'consolidate' ? buildConsolidateQueue(p)
    : buildReviewQueue(p, pool);
if (!queue.length) { toast('今天没有这类任务'); return; }
  session = {
    part, kind, queue, idx: -1, consQ: kind === 'consolidate' ? state.settings.consQ : null, consPool: kind === 'consolidate' ? state.settings.consPool : null,
    newDone: 0, revDone: 0, ok: 0, tot: 0, startTs: Date.now(), doneLog: [],   // 完成时刻数组（近窗配速用，v6.26）
    requeued: new Set(), entry: null, options: null, answered: false,
    mixDir: {},   // chunkMix 方向表：key→'zh'|'en'；每词每轮只随机一次，回队重考保持同向
    reportItems: [], renderedNew: [], gradedKeys: new Set(),
    doneWords: new Set(), totalWords: new Set(queue.map(q => q.key)).size,
  };
  $('chipAcc').textContent = '正确 —';
  $('chipPace').textContent = '速度 —';
  $('chipEta').textContent = '预计 —';
  showView('sessionView');
  nextQuestion();
}
function curItem() { return session.queue[session.idx]; }

/* 统一配速估算（v6.26）：近 5 分钟（now-300000 之后）完成 ≥3 词 → 近窗配速（条数/5）；
   否则退回累计均速 doneWords.size / 会话分钟数；两者都没有（开场）返回 0 */
function sessionPace(s) {
  const now = Date.now();
  const recent = (s.doneLog || []).filter(ts => ts > now - 300000).length;
  if (recent >= 3) return recent / 5;
  const paceMin = (now - s.startTs) / 60000;
  if (paceMin > 0 && s.doneWords.size > 0) return s.doneWords.size / paceMin;
  return 0;
}

/* 三枚芯片统一刷新（v6.26）：正确率 / 速度 / 预计时间。
   renderQuestion、applyResult 与 5 秒时钟定时器三处共用；开场 30 秒内速度与预计仍显 — */
function refreshChips() {
  if (!session) return;
  const paceMin = (Date.now() - session.startTs) / 60000;
  $('chipAcc').textContent = session.tot ? `正确 ${(session.ok/session.tot*100).toFixed(1)}%` : '正确 —';
  const pace = Math.max(sessionPace(session), 0);
  $('chipPace').textContent = paceMin < 0.5 ? '速度 —' : `速度 ${pace.toFixed(1)} 词/分`;
  const remainWords = Math.max(session.totalWords - session.doneWords.size, 0);
  const etaMin = pace > 0 ? remainWords / pace : 0;   // 剩余/配速，配速为 0 时不除
  $('chipEta').textContent = (paceMin < 0.5 || pace <= 0 || !remainWords) ? '预计 —'
    : etaMin < 1 ? '预计 不到1分钟'
    : etaMin < 60 ? `预计 ${Math.ceil(etaMin)} 分钟`
    : `预计 ${Math.floor(etaMin/60)} 小时 ${Math.round(etaMin%60)} 分`;
}

function nextQuestion() {
  session.idx++;
  if (session.idx >= session.queue.length) return finishSession();
  const item = curItem();
  let pool = PARTS[session.part].pool();
  if (session.kind === 'consolidate' && session.consPool === 'prep') {
    pool = window.PREPOSITIONS.map(x => ({ w: x.w, m: [x.rule], sentences: x.sentences || [x.ex] }));
  }

  // 组合题型：每道题现场随机落成一种具体题型（重做题也会换题型）
  if (item.mode === 'mix') {
    item.mode = ["e2c", "listen", "c2e", "spell", "spellc", "chunk", "chunkMix", "zhChunk"][Math.floor(Math.random() * 8)];
  }

  // 新词首次展示 → 计入今日新学、登记进度、推进游标
  const p = state[session.part];
  const prog = progOf(p, item.key);
  if (item.isNew && !prog.added) {
    prog.added = TODAY;
    p.todayNew++;
    prog.iv = 1; prog.ease = 2.5; prog.due = addDays(TODAY, 1);   // 看卡即入明天复习轨道
    let c = p.newCursor;
    while (c < pool.length && pool[c].w !== item.key) c++;
    p.newCursor = Math.min(pool.length, c + 1);
    session.renderedNew.push({ key: item.key, idx: c });   // 未作答退出时全额退回
  }
  save();

  if (session.consPool === 'prep') {
    const prep = pool.find(x => x.w === item.key);
    session.entry = prep;
    const basePrep = prep.w.replace(/\(.*\)/, '').trim();
    const COMMON_PREPS = ['in','on','at','by','for','with','from','to','of','about','during','since','until','near','between','among','under','above','opposite'];
    const distractors = [];
    const seen = new Set([basePrep]);
    for (const cp of COMMON_PREPS) { if (!seen.has(cp)) { seen.add(cp); distractors.push(cp); } }
    session.options = shuffle([
      { text: basePrep, correct: true },
      ...distractors.slice(0, 3).map(d => ({ text: d, correct: false }))
    ]);
  } else if (item.mode === 'c2e') {
    // 听中文选词：选项是英文词（介词动词显示"动词 介词"整体，v6.14；B33 修复：此前误走中文释义选项）
    const { entry, options } = makeWordOptions(pool, item.key);
    session.entry = entry;
    session.options = options;
  } else {
    const { entry, options } = makeOptions(pool, item.key);
    session.entry = entry;
    session.options = options;
  }
  session.answered = false;
  renderQuestion();
  // 预加载后面几题的本地读音（含听中文写词的中文音频），播放零等待
  if (window.AUDIO_INDEX || window.AUDIO_ZH || window.AUDIO_ZHC) {
    session.queue.slice(session.idx, session.idx + 4).forEach(it => {
      const srcs = [window.AUDIO_INDEX && window.AUDIO_INDEX[it.key],
        (it.mode === 'spellc' && window.AUDIO_ZH) ? window.AUDIO_ZH[it.key] : null,
        (it.mode === 'spellc' && window.AUDIO_ZHC) ? window.AUDIO_ZHC[it.key] : null];
      srcs.forEach(src => {
        if (src && !preloadedAudio.has(src)) {
          const a = new Audio(src);
          a.preload = 'auto';
          a.load();
          preloadedAudio.add(src);
        }
      });
    });
  }
}

function renderQuestion() {
  const item = curItem();
  const entry = session.entry;

  // 顶部
  $('sessionFill').style.width = (session.doneWords.size / session.totalWords * 100) + '%';
  $('sessionPos').textContent = `${session.doneWords.size}/${session.totalWords} 词`;
  $('chipNew').textContent = `新 ${session.newDone}`;
  $('chipRev').textContent = `复 ${session.revDone}`;
  refreshChips();

  // 区域显隐
  $('teachArea').classList.add('hidden');
  $('qPromptArea').classList.add('hidden');
  $('choiceArea').classList.add('hidden');
  $('spellArea').classList.add('hidden');
  $('giveupRow').classList.add('hidden');
  $('feedback').classList.add('hidden');
  $('nextRow').classList.add('hidden');

  const teachPhase = item.mode === 'new' && !item.taught;
  const kindText = {
    new: '🆕 新学 · 选出意思',
    test: '🧪 新学小测 · 刚学的这组词',
    listen: '👂 听音辨义 · 听英文选中文',
    c2e: '🎧 听中文选词 · 选出英文',
    spell: '✍️ 拼写默写 · 写出英文',
    spellc: '🎧 听中文写词 · 拼出英文',
    chunk: '🧩 组合拼写 · 听中文 · 点词块拼词',
    chunkMix: '🔀 组合拼写·混合 · 听中文/听音 · 点词块拼词',
    zhChunk: '🧠 意象组合 · 听英文 · 选出全部正确意象',
  }[item.mode];
  $('qKind').textContent = teachPhase ? '🆕 新学 · 先认识一下'
    : (kindText || (session.part === 'words' ? '👀 看词选义 · 单词' : '💬 看短语选义 · 短语'));

  // 掌握状态徽章
  const badge = $('qStatus');
  badge.textContent = teachPhase ? '🆕 新学' : statusOf(state[session.part], item.key).label;
  badge.className = 'status-badge ' + (teachPhase ? 'st-new' : statusOf(state[session.part], item.key).cls);

  if (teachPhase) {
    // 学习卡：看词、听音、看释义
    $('teachArea').classList.remove('hidden');
    const tw = $('teachWord');
    tw.textContent = enForm(entry);
    tw.classList.remove('blind');                       // 看卡英文单词始终显示（新学需要看到词形）
    tw.classList.toggle('small', enForm(entry).length > 14);
    // 「听中文题型隐藏汉字」在看卡同样生效：开=中文释义只听不显示（纯听音训练）
    const tm = $('teachMeaning');
    if (state.settings.zhBlind) {
      tm.classList.add('muted');
      tm.textContent = '🔊 听中文释义 · 看英文回忆意思';
    } else {
      tm.classList.remove('muted');
      tm.innerHTML = session.part === 'words'
        ? entry.m.map(m => {
            const mm = m.match(POS_PREFIX);
            return mm ? `<span class="pos">${esc(posTagOf(m))}</span> ${esc(m.replace(POS_PREFIX, ''))}` : esc(m);
          }).join('<br>')
        : esc(fullMeaning(entry));
    }
    // 看卡流程：先读中文释义，读完读英文，读毕自动翻下一张（手动按钮/回车亦可）
    stopAllAudio();
    const zhText = zhSpeakText(entry);
    speechQueue.length = 0;
    const zhMP3 = zhAudioFor(entry);
    speechQueue.push(zhMP3 ? { src: zhMP3 } : { zh: zhText });
    const enSrc = window.AUDIO_INDEX && window.AUDIO_INDEX[enForm(entry)];
    speechQueue.push(enSrc ? { src: enSrc } : enForm(entry));
    const it = item;
    queueDrainCb = () => {
      if (!session || curItem() !== it) return;
      if (document.hidden) { session.pendingCard = it; return; }   // 后台标签：暂停翻页，切回再继续
      advanceCard(it);
    };
    pumpSpeech();
    return;
  }

  $('qPromptArea').classList.remove('hidden');
  $('choiceArea').classList.remove('chunk-area');   // B15 泄漏修复：块系题型的横排类每题开头清除，防止残留覆盖后续选择题网格布局
  const qWord = $('qWord');
  const fs = firstSense(entry);
  // chunkMix 方向分配：session.mixDir[key] 不存在才抽取，存在则复用——
  // 同一词回队重考、设置弹窗重渲染都保持同向，绝不每题重新随机。
  // 首次抽取用自适应均衡（修正纯抛硬币在 750 词下的小样本失衡，如 55/45；
  // 混合方向本身保留——contextual interference 效应，Shea & Morgan 1979）：
  // 统计已分配的 zh/en 数，diff 为正（zh 偏多）则降 P(zh)，
  // P(zh) = 0.5 - 0.25·diff/(zh+en+1)，钳制在 0.25~0.75 保随机性、防死板交替
  let mixDirZh = false;
  if (item.mode === 'chunkMix') {
    if (!session.mixDir) session.mixDir = {};
    if (!session.mixDir[item.key]) {
      let zhCount = 0, enCount = 0;
      for (const dir of Object.values(session.mixDir)) {
        if (dir === 'zh') zhCount++; else enCount++;
      }
      const diff = zhCount - enCount;
      let pZh = 0.5 - 0.25 * (diff / (zhCount + enCount + 1));
      pZh = Math.max(0.25, Math.min(0.75, pZh));
      session.mixDir[item.key] = Math.random() < pZh ? 'zh' : 'en';
    }
    mixDirZh = session.mixDir[item.key] === 'zh';
  }
  // zh 方向与 chunk 完全一致：zhBlind 遮罩生效、chunkHint 豁免；en 方向不涉及中文
  const hideZh = (item.mode === 'c2e' || item.mode === 'spellc' || (item.mode === 'chunk' && !state.settings.chunkHint) || (item.mode === 'chunkMix' && mixDirZh && !state.settings.chunkHint)) && !!state.settings.zhBlind;
  // 题干：听中文写词=首个释义的中文；看义选词/拼写默写=完整中文意思；其余显示英文
  let truePrompt = null;   // 提示按钮可揭示的真文本（题面被隐藏时才有值）
  if (item.mode === 'spellc') {
    // 隐藏汉字时显示干净提示（不是马赛克），纯靠听音作答；显示与朗读同源（前 N 义，v6.10）
    if (hideZh) { truePrompt = zhReadDisplay(entry); qWord.textContent = '🔊 听发音 · 写出英文'; qWord.classList.add('muted'); }
    else { qWord.textContent = zhReadDisplay(entry); qWord.classList.remove('muted'); }
  } else if (item.mode === 'c2e') {
    if (hideZh) { truePrompt = zhReadDisplay(entry); qWord.textContent = '🔊 听 · 选出英文'; qWord.classList.add('muted'); }
    else { qWord.textContent = zhReadDisplay(entry); qWord.classList.remove('muted'); }
  } else if (session.consPool === 'prep') {
    const sents = entry.sentences || [entry.rule];
    qWord.textContent = sents[Math.floor(Math.random() * sents.length)];
  } else if (item.mode === 'spell') {
    qWord.textContent = fullMeaning(entry);
  } else if (item.mode === 'chunkMix') {
    // 组合拼写·混合：zh 方向与 chunk 题面完全一致；en 方向只听音作答，
    // v6.31 改为选中文意思块（题面提示同步改为「选出正确的中文意思」），音频仍播英文读音
    // v6.33 提示按钮对齐其他题型：英文向点提示显示英文单词（与听音辨义同款，没听清时看词形，不泄中文答案）
    if (!mixDirZh) { truePrompt = enForm(entry); qWord.textContent = '🔊 听发音 · 选出正确的中文意思'; qWord.classList.add('muted'); }
    else if (hideZh) { truePrompt = zhReadDisplay(entry); qWord.textContent = '🔊 听中文 · 点词块拼出英文'; qWord.classList.add('muted'); }
    else { qWord.textContent = zhReadDisplay(entry); qWord.classList.remove('muted'); }
  } else if (item.mode === 'chunk') {
    // 组合拼写：报中文（设置开「隐藏中文」则只听音），词块拼出英文；显示与朗读同源（前 N 义，v6.10）
    if (hideZh) { truePrompt = zhReadDisplay(entry); qWord.textContent = '🔊 听中文 · 点词块拼出英文'; qWord.classList.add('muted'); }
    else { qWord.textContent = zhReadDisplay(entry); qWord.classList.remove('muted'); }
  } else if (item.mode === 'zhChunk') {
    // 意象组合：报英文；设置开「意象组合隐藏英文」则只听音选意象
    if (state.settings.teachBlind) { truePrompt = enForm(entry); qWord.textContent = '🔊 听发音 · 选出全部正确意象'; qWord.classList.add('muted'); }
    else { qWord.textContent = enForm(entry); qWord.classList.remove('muted'); }
  } else if (session.consPool === 'prep') {
    const sents = entry.sentences || [entry.rule];
    qWord.textContent = sents[Math.floor(Math.random() * sents.length)];
  } else if (item.mode === 'listen') {
    // 听音辨义：干净听音提示（不显词形马赛克——字母数/轮廓也算泄题，v6.16）；提示按钮可揭示原词
    qWord.textContent = '🔊 听发音 · 想好意思再出选项';
  } else {
    qWord.textContent = enForm(entry);
  }
  qWord.classList.toggle('blind', item.mode === 'listen');
  qWord.classList.toggle('small', qWord.textContent.length > 14);
  if (item.mode === 'listen') truePrompt = enForm(entry);
  // 提示按钮：仅当题面被隐藏（纯听音/纯盲选）时出现；点击显示真文本，不计错
  const hintBtn = document.getElementById('btnHint');
  const promptHidden = qWord.classList.contains('blind') || qWord.classList.contains('muted');
  session.peekOn = false;
  if (promptHidden && truePrompt) {
    hintBtn.style.display = '';
    session.peekText = truePrompt;
    session.peekPlaceholder = qWord.textContent;
    session.peekBlind = qWord.classList.contains('blind');
  } else {
    hintBtn.style.display = 'none';
    session.peekText = null;
  }

  if (item.mode === 'chunk' || item.mode === 'chunkMix' || item.mode === 'zhChunk') {
    // 组合拼写（含 chunkMix 两方向）：真实词块 + 干扰词块（从词库随机抽词拆块，防背位置模板），打乱展示
    // 意象组合：报英文，中文释义按词性拆成意象模块 + 干扰模块，选齐全部正确意象
    $('choiceArea').classList.remove('hidden');
    $('choiceArea').classList.add('chunk-area');
    const isZh = item.mode === 'zhChunk' || (item.mode === 'chunkMix' && !mixDirZh);
    let real;
    if (item.mode === 'chunkMix' && !mixDirZh) {
      // v6.31 chunkMix·en：听英文 → 从中文块中选出词性+意思模块，块数跟「朗读义项数 N」走
      // （zhReadSeq 与朗读同源截断）；块文本带不带词性前缀跟「朗读词性」设置走（关=纯意思块，毕业模式）。
      // st.type 置 'zh' → 复用 sameModules 顺序无关判分与中文块 UI；干扰块走下方 zh 向逻辑（splitMeaningModules 抽他词）
      real = zhReadSeq(entry).map(it =>
        (state.settings.zhSpeakPos === false || !it.pos ? '' : it.pos + '. ') + it.sense);
      if (!real.length) real = splitMeaningModules(entry);   // m 为空的兜底（防 0 块题）
    } else if (isZh) {
      real = splitMeaningModules(entry);
    } else {
      real = splitWordChunks(enForm(entry).replace(/ /g, ''));   // 介词动词块含介词（abideby），空格剔除
    }
    const realSet = new Set(real);
    const dparts = [];
    const wantD = isZh ? Math.min(3, Math.max(2, 5 - real.length))
                       : Math.min(3, Math.max(2, 6 - real.length));
    const others = PARTS[session.part].pool();
    let guard = 0;
    while (dparts.length < wantD && guard++ < 60) {
      const other = others[Math.floor(Math.random() * others.length)];
      if (!other || other.w === entry.w) continue;
      const oc = isZh ? splitMeaningModules(other) : splitWordChunks(other.w);
      let pick = oc[Math.floor(Math.random() * oc.length)];
      // v6.32 泄题修复：chunkMix 英文向的干扰块与正确块统一跟「朗读词性」设置——关词性时剥离前缀，
      // 否则无前缀的全是答案（splitMeaningModules 产物自带词性前缀，与 zhReadSeq 构建的裸块混排会泄题）
      if (item.mode === 'chunkMix' && !mixDirZh && state.settings.zhSpeakPos === false && pick)
        pick = pick.replace(/^[a-z]+\.\s+/, '');
      if (!pick || realSet.has(pick) || dparts.includes(pick)) continue;
      if (!isZh && pick.length > 6) continue;
      if (isZh && pick.length > 26) continue;
      dparts.push(pick);
    }
    const chunks = shuffleArr(real.concat(dparts));
    session.chunkState = { picked: [], chunks, need: real.length, real, type: isZh ? 'zh' : 'en' };
    // 拼接槽在顶部、词块横排在下、再配「不记得，看答案」
    $('choiceArea').innerHTML =
      `<div class="chunk-built" id="chunkBuilt"></div>` +
      chunks.map((c, i) =>
        `<button class="chunk-btn${isZh ? ' zh' : ''}" data-i="${i}">${esc(c)}</button>`).join('') +
      `<button class="btn-ghost" id="btnChunkGiveup" style="flex-basis:100%;margin-top:4px">不记得，看答案 😵</button>`;
  } else if (item.mode === 'spell' || item.mode === 'spellc') {
    $('spellArea').classList.remove('hidden');
    const inp = $('spellInput');
    inp.value = '';
    inp.disabled = false;
    inp.className = 'answer-input';
    $('btnSpellGiveup').disabled = false;
    $('btnSpellSubmit').disabled = false;
    setTimeout(() => { if (session && !session.answered) inp.focus(); }, 80);   // 自动聚焦，直接打字
  } else {
    // 听音辨义/听中文选词：先遮住选项（万词王式"想起来再出选项"，v6.16），点「已知晓/已想起」后再出
    const revealed = !((item.mode === 'listen' || item.mode === 'c2e') && !item.revealed);
    $('listenMask').classList.toggle('hidden', revealed || (item.mode !== 'listen' && item.mode !== 'c2e'));
    const revealBtn = document.getElementById('btnReveal');
    if (revealBtn) revealBtn.textContent = item.mode === 'c2e' ? '🤔 已想起 · 出示选项' : '🤔 已知晓意思 · 出示选项';
    if (revealed) {
      $('choiceArea').classList.remove('hidden');
      $('choiceArea').innerHTML = session.options.map((o, i) =>
        `<button class="opt" data-i="${i}"><span class="key">${i + 1}</span>${esc(o.text)}</button>`).join('');
    }
    if (item.mode === 'listen') {
      $('giveupRow').classList.remove('hidden');
      $('btnGiveup2').disabled = false;
    }
  }

  // 发音：听中文写词/听中文选词/组合拼写播「中文词性+释义」缓存（无缓存退回中文合成）；其余读题干单词。
  // 上一答的英文强化朗读若仍在播，题面读音追加在其后（不掐断强化记忆）；否则清队列直接播。
  // 忙标志卡死已由 onpause 回调根治（B24），此处不再需要一刀切重置。
  const appendAudio = !!(session.lastReinforceAt && Date.now() - session.lastReinforceAt < 3000);
  // 重听按钮同样按题型播对应内容：听中文题型重听中文，绝不重播英文泄答案
  if (item.mode === 'spellc' || item.mode === 'c2e' || item.mode === 'chunk' || (item.mode === 'chunkMix' && mixDirZh)) {
    // 介词规则：中文播「规则全文」（要背的就是规则），不能用词表释义缓存
    if (session.consPool === 'prep') {
      const ruleText = sanitizeZhText(fullMeaning(entry));
      session.replayItem = { zhText: ruleText };
      speakZh(ruleText, appendAudio);   // v6.36：与下方 playZhSeqFor 同契约——强化在播时追加在其后，不再旁路叠音
    } else {
      // 词义库 v2（v6.9）：逐义项 MP3（AUDIO_SENSE）+ 词性名文件（AUDIO_POS）按前 N 义组合连播，
      // N 改动即时生效无需重生成；音频未生成完的词整体退回合成（生成完毕自动切小晓）
      session.replayItem = playZhSeqFor(entry, appendAudio);   // v6.34 抽公用（题面与强化共用一份实现）
    }
  } else if (session.consPool === 'prep') {
    // 介词规则的英文侧题型（听音辨义/组合拼写）：读介词本身
    session.replayItem = enForm(entry);
    autoSpeak(enForm(entry), appendAudio);
  } else {
    session.replayItem = enForm(entry);
    autoSpeak(enForm(entry), appendAudio);
  }

  // v6.29 微动效：新题题干淡入 0.2s（新题就位的克制提示；学习卡分支已提前 return，不受影响）
  fxRun(g => g.fromTo('#qPromptArea', { autoAlpha: 0 },
    { autoAlpha: 1, duration: 0.2, ease: 'power1.out', overwrite: 'auto', clearProps: 'all' }));
}

/* ───────────── 学习卡：看完一张直接下一张，整组看完再统一测验 ───────────── */
/* 看卡推进（朗读完毕自动或手动点击）：登记为已学，切下一张；手动推进即截断当前朗读 */
function advanceCard(item) {
  queueDrainCb = null;
  stopAllAudio();
  if (session) {
    session.gradedKeys.add(item.key);       // 已看完 → 退出时不退款
    session.doneWords.add(item.key);
    session.newDone++;
    session.reportItems.push({ key: item.key, mode: 'new', ok: true });
    const p = state[session.part];
    const h = p.history[TODAY] || (p.history[TODAY] = { n: 0, r: 0, ok: 0, tot: 0 });
    h.n++; h.tot++; h.ok++;
  }
  item.taught = true;
  nextQuestion();
}
function markTaught() {
  const item = curItem();
  if (!item || item.mode !== 'new' || item.taught) return;
  advanceCard(item);
}

/* 组合拼写/意象组合：把已选的块渲染成可点击拿回的 token（点一下撤回） */
function renderChunkBuilt() {
  const st = session && session.chunkState;
  if (!st) return;
  const el = document.getElementById('chunkBuilt');
  if (!el) return;
  el.innerHTML = st.picked.map((p, k) =>
    `<button class="chunk-token${st.type === 'zh' ? ' zh' : ''}" data-p="${k}">${esc(p.text)}</button>`).join('');
}
/* 组合拼写：不记得 → 看答案（判错回队，展示正确单词+词义） */
function chunkGiveup() {
  if (!session || session.answered) return;
  stopAllAudio();
  session.answered = true;
  const item = curItem();
  [...document.querySelectorAll('.chunk-btn')].forEach(b => { b.disabled = true; b.classList.add('used'); });
  const gb = document.getElementById('btnChunkGiveup');
  if (gb) gb.disabled = true;
  applyResult(false, item,
    `${fbWordHtml(session.entry)}` +
    `<div class="fb-meaning">${esc(fullMeaning(session.entry))}</div>`);
  scheduleNext(autoNextMs(false));
}

/* ───────────── 选择作答（新学答题 / 看词选义 / 听音辨义） ───────────── */
function answerChoice(i) {
  if (session.answered || curItem().mode === 'spell' || ((curItem().mode === 'listen' || curItem().mode === 'c2e') && !curItem().revealed)) return;
  stopAllAudio();
  session.answered = true;
  const item = curItem();
  const opt = session.options[i];
  const btns = [...document.querySelectorAll('#choiceArea .opt')];
  btns.forEach((b, j) => {
    b.disabled = true;
    if (session.options[j].correct) b.classList.add('right');
    else if (j === i) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  // 听音辨义：作答后揭示单词
  if (item.mode === 'listen') $('qWord').classList.remove('blind');
  const fb = opt.correct ? ''
    : `正确答案：${esc(fullMeaning(session.entry))}<br><span class="your">你选了：${esc(opt.text)}</span>`;
  applyResult(opt.correct, item, fb);
  $('btnGiveup2').disabled = true;
  scheduleNext(autoNextMs(opt.correct));
}

/* ───────────── 拼写默写 ───────────── */
function submitSpell(giveup = false) {
  if (session.answered || (curItem().mode !== 'spell' && curItem().mode !== 'spellc')) return;
  const inp = $('spellInput');
  const val = inp.value.trim();
  if (!giveup && !val) giveup = true;   // 空输入提交 = 不会（直接出答案判错回队，v6.17）
  session.answered = true;
  const item = curItem();
  const ok = !giveup && normEn(val) === normEn(enForm(session.entry));
  stopAllAudio();                          // 提交即停掉题目朗读，不拖沓
  inp.disabled = true;
  inp.classList.add(ok ? 'right' : 'wrong');
  $('btnSpellGiveup').disabled = true;
  $('btnSpellSubmit').disabled = true;
  const qw = $('qWord');
  qw.textContent = enForm(session.entry);          // vp 词显示"动词 介词"整体（v6.17 补漏）
  qw.classList.remove('blind');
  qw.classList.toggle('small', enForm(session.entry).length > 14);
  applyResult(ok, item,
    `${fbWordHtml(session.entry)}` +
    `${session.entry.m.map(m => {
      const mm = m.match(POS_PREFIX);
      return mm ? `<div class="fb-meaning"><span class="pos">${esc(posTagOf(m))}</span> ${esc(m.replace(POS_PREFIX, ''))}</div>` : `<div class="fb-meaning">${esc(m)}</div>`;
    }).join('')}`);
  scheduleNext(autoNextMs(ok, curItem().mode));   // 展示正确拼写后自动翻页，不朗读英文
}

/* ───────────── 听音辨义：直接看答案 ───────────── */
function giveupListen() {
  if (session.answered || curItem().mode !== 'listen') return;
  session.answered = true;
  const item = curItem();
  [...document.querySelectorAll('#choiceArea .opt')].forEach((b, j) => {
    b.disabled = true;
    if (session.options[j].correct) b.classList.add('right');
    else b.classList.add('dim');
  });
  $('qWord').classList.remove('blind');
  applyResult(false, item,
    `${fbWordHtml(session.entry)}` +
    `<div class="fb-meaning">${session.entry.m.map(m => {
      const mm = m.match(POS_PREFIX);
      return mm ? `<span class="pos">${esc(posTagOf(m))}</span> ${esc(m.replace(POS_PREFIX, ''))}` : esc(m);
    }).join('<br>')}</div>`);
  $('btnGiveup2').disabled = true;
  scheduleNext(autoNextMs(false));
}

/* ───────────── 统一记录结果 ───────────── */
function applyResult(ok, item, fbHtml) {
  const sp = session.part;
  const p = state[sp];
  if (ok) gradeCorrect(p, item.key); else gradeWrong(p, item.key);

  const newFamily = item.isNew || item.isQuiz;   // 新学阶段的测验算新学统计
  if (newFamily) {
    session.newDone++;
  } else {
    session.revDone++;
    if (!item.extra) {
      p.todayReview++;                         // 巩固/加练不是复习，不计入每日任务量
      // 只有「每日复习」记入已复习名单；巩固练习完全不动复习侧的任何状态
      if (!Array.isArray(p.reviewedToday)) p.reviewedToday = [];
      if (!p.reviewedToday.includes(item.key)) p.reviewedToday.push(item.key);
    }
  }
  session.tot++; if (ok) session.ok++;

  const h = p.history[TODAY] || (p.history[TODAY] = { n: 0, r: 0, ok: 0, tot: 0 });
  if (newFamily) h.n++; else h.r++;
  h.tot++; if (ok) h.ok++;

  // 错题重做（万词王式）：答错后不马上重考，塞回队列隔几题再出现。错了反复回队直到答对
  if (!ok) {
    const redo = { ...item, isReask: true, revealed: false };
    const gap = session.idx + 4 + Math.floor(Math.random() * 3);
    session.queue.splice(Math.min(gap, session.queue.length), 0, redo);
  }
  // 强化记忆：答对/答错都朗读一遍英文读音（只读英文，不读中文）；
  // 记录时间戳，新题渲染时把题面读音排在本朗读之后（不掐断）
  stopAllAudio();
  if (session.entry && session.entry.w) {
    session.lastReinforceAt = Date.now();
    // v6.34 强化朗读跟方向对偶：chunkMix 英文向（听英文选中文）答后强化读中文（前 N 义同管线）；
    // 中文向与其余题型维持读英文（你拼的就是英文，强化英文）
    if (item.mode === 'chunkMix' && session.mixDir && session.mixDir[item.key] === 'en') {
      playZhSeqFor(session.entry, false);
    } else {
      autoSpeak(enForm(session.entry));
    }
  }
  // 报告记录
  session.reportItems.push({ key: item.key, mode: item.mode, ok });
  session.gradedKeys.add(item.key);
  session.doneWords.add(item.key);
  session.doneLog.push(Date.now());          // 完成时刻入账：近 5 分钟窗口算实时配速（v6.26）
  // 巩固练习：作答计入当前题型轨道的进度（几杠几）
  if (session.kind === 'consolidate') {
    const tr = p.cons && p.cons.tracks[session.consQ];
    if (tr) {
      tr.remaining = tr.remaining.filter(k => k !== item.key);
      tr.done = tr.total - tr.remaining.length;
    }
  }
  save();

  if (fbHtml !== null) {
    const fb = $('feedback');
    fb.className = 'feedback ' + (ok ? 'ok' : 'bad');
    fb.classList.remove('hidden');
    $('fbHead').textContent = ok ? '✓ 答对了' : '✗ 答错了';
    $('fbBody').innerHTML = fbHtml || '';
    // v6.29 微动效：答对轻弹 scale 0.97→1（绿色反馈）／答错轻晃 x ±6px（红色反馈），均在 0.3s 内
    if (ok) {
      fxRun(g => g.fromTo(fb, { scale: 0.97 },
        { scale: 1, duration: 0.3, ease: 'back.out(1.7)', overwrite: 'auto', clearProps: 'transform' }));
    } else {
      fxRun(g => g.timeline({
          defaults: { overwrite: 'auto' },
          onComplete: () => { try { g.set(fb, { clearProps: 'x' }); } catch (e) {} },
        })
        .to(fb, { x: -6, duration: 0.075, ease: 'power1.out' })
        .to(fb, { x: 6, duration: 0.15, ease: 'sine.inOut' })
        .to(fb, { x: 0, duration: 0.075, ease: 'power1.in' }));
    }
  }
  $('sessionFill').style.width = (session.doneWords.size / session.totalWords * 100) + '%';
  $('chipNew').textContent = `新 ${session.newDone}`;
  $('chipRev').textContent = `复 ${session.revDone}`;
  refreshChips();
  $('sessionPos').textContent = `${session.doneWords.size}/${session.totalWords} 词`;
}

/* ═══════════ 结束与报告 ═══════════ */
function finishSession() {
  const acc = session.tot ? Math.round(session.ok / session.tot * 100) : 0;
  showView('doneView');
  $('doneNew').textContent = session.newDone;
  $('doneRev').textContent = session.revDone;
  $('doneAcc').textContent = acc + '%';
  $('doneEmoji').textContent = acc >= 90 ? '🏆' : acc >= 75 ? '🎉' : acc >= 60 ? '💪' : '📖';
  $('doneTitle').textContent =
    acc >= 90 ? '太棒了，基本全对！' : acc >= 75 ? '完成得很好！' : acc >= 60 ? '继续加油！' : '错的词明天会重点复习';

  // 中途退出（实事求是）：展示过但未作答的新词全额退回——
  // 删进度、退今日新学额度、游标回退，重新进来学到的还是同一个词
  const pEnd = state[session.part];
  const poolEnd = PARTS[session.part].pool();
  let rollCursor = pEnd.newCursor;
  let refunded = 0;
  (session.renderedNew || []).forEach(r => {
    if (session.gradedKeys.has(r.key)) return;
    if (r.idx >= 0) rollCursor = Math.min(rollCursor, r.idx);
    delete pEnd.progress[r.key];
    if (pEnd.todayNew > 0) pEnd.todayNew--;
    refunded++;
  });
  if (refunded > 0) {
    pEnd.newCursor = Math.min(pEnd.newCursor, rollCursor);
    save();
  }

  // 每日复习收官：今日到期已清零 → 自动划入新一批新学词
  if (session.kind === 'review') {
    const dueLeft = Object.keys(pEnd.progress).filter(k => {
      const q = pEnd.progress[k];
      return q.added && q.due && q.due <= TODAY;
    }).length;
    if (dueLeft === 0) autoSettleNew();
  }

  // 上报学习报告（AI 事后查看学习情况并安排后续）
  const report = {
    date: TODAY, ts: new Date().toISOString(),
    part: session.part, kind: session.kind,
    summary: { new: session.newDone, review: session.revDone, ok: session.ok, total: session.tot, acc },
    items: session.reportItems,
  };
  sendReport(report);
  $('btnNextGroup').classList.add('hidden');   // 巩固进度在首页延续（继续/重学）
  session = null;
}
function sendReport(report) {
  if (TEST_MODE) return;   // 测试沙盒：不上传报告，不污染每日记录
  if (!location.origin.startsWith('http')) { toast('未连接本地服务，报告未保存（请用 启动学习.bat 启动）', 2600); return; }
  fetch('/api/report', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  }).then(r => { if (r.ok) toast('今日报告已保存，随时叫 AI 批改口语题'); })
    .catch(() => toast('报告保存失败（服务未启动？）', 2400));
}

/* ═══════════ AI 计划（data/ai_plan.json，由 AI 每轮写入） ═══════════ */
async function loadPlan() {
  if (TEST_MODE) return;
  if (!location.origin.startsWith('http')) return;
  try {
    const r = await fetch('/api/plan');
    const plan = await r.json();
    if (!plan || typeof plan !== 'object') return;
    if (plan.banner) {
      const b = $('planBanner');
      b.textContent = '🤖 AI 安排：' + plan.banner;
      b.classList.remove('hidden');
    }
    // 计划内容没变就不覆盖：否则每次刷新都会把用户手动改过的设置冲回去，
    // 还会反复强设 setProgress 里错词的进度。内容变了才生效一次。
    // 数量字段（newWords/revWords 等）完全归用户设置管，计划永不覆盖（B13 复发教训：
    // 每次更新计划文件都会重放一次覆盖）。计划只管 banner 与优先词 setProgress。
    const sig = JSON.stringify([
      plan.banner || '',
      (plan.setProgress || []).map(e => (e && e.part + ':' + e.key + ':' + (e.due || ''))).join(','),
    ]);
    if (state.planSig === sig) return;
    const s = state.settings;
    if (Array.isArray(plan.setProgress)) {
      for (const e of plan.setProgress) {
        if (!e || !PARTS[e.part] || !e.key) continue;
        const prog = progOf(state[e.part], e.key);
        // 防回退：这个词用户已复习推进过（到期日在今天或更晚）→ 绝不拉回旧值，
        // 否则计划重放一次就会让做对过的词"复活"
        if (prog.due && prog.due >= TODAY) continue;
        if (!prog.added) prog.added = e.added || TODAY;
        for (const f of ['iv', 'ease', 'due', 'wrong', 'right', 'streak']) {
          if (e[f] != null) prog[f] = e[f];
        }
      }
    }
    state.planSig = sig;
    save();
  } catch (e) { /* 没有计划文件就按默认节奏 */ }
}

/* ═══════════ 词书列表（状态标签） ═══════════ */
let listFilter = 'all';
let listShown = 0;
const LIST_CHUNK = 100;

function collectList() {
  const p = state[part];
  const pool = PARTS[part].pool();
  const all = pool.map(e => ({ e, st: statusOf(p, e.w), prog: p.progress[e.w] }));
  return listFilter === 'all' ? all : all.filter(x => x.st.id === listFilter);
}
function renderList(reset) {
  const rows = collectList();
  const empty = $('listEmpty');
  if (reset) listShown = 0;
  const slice = rows.slice(listShown, listShown + LIST_CHUNK);
  const html = slice.map(({ e, st, prog }) =>
    `<div class="wrow">
      <span class="w">${esc(e.w)}</span>
      <span class="m">${esc(fullMeaning(e))}</span>
      ${prog && prog.due ? `<span class="due">${prog.due.slice(5)}</span>` : ''}
      <span class="status-badge badge ${st.cls}">${st.label}</span>
    </div>`).join('');
  $('wordList').insertAdjacentHTML('beforeend', html);
  listShown += slice.length;
  $('btnMore').classList.toggle('hidden', listShown >= rows.length);
  empty.classList.toggle('hidden', rows.length > 0);
  updatePracticeBtn();
}
/* 加练按钮：筛选结果里有已学词才显示，上限同每日复习上限 */
function updatePracticeBtn() {
  const btn = $('btnPractice');
  if (listFilter === 'new') { btn.classList.add('hidden'); return; }
  const learned = collectList().filter(x => x.prog && x.prog.added).length;
  if (!learned) { btn.classList.add('hidden'); return; }
  const isWords = PARTS[part].pool() === window.IELTS_WORDS;
  const cap = isWords ? state.settings.revWords : state.settings.revPhrases;
  btn.textContent = `🎯 加练：这批词里错得最多的前 ${Math.min(learned, cap)} 个`;
  btn.classList.remove('hidden');
}
function openList() {
  listFilter = 'all';
  // 筛选芯片显示各状态数量
  const p = state[part];
  const counts = { all: 0, bad: 0, over: 0, done: 0, mid: 0, learning: 0, new: 0 };
  for (const e of PARTS[part].pool()) {
    const st = statusOf(p, e.w);
    counts.all++; counts[st.id]++;
  }
  document.querySelectorAll('#filterRow .filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.f === 'all');
    c.textContent = c.dataset.label + ' ' + counts[c.dataset.f];
  });
  $('listTitle').textContent = `词书列表 · ${PARTS[part].title}`;
  $('wordList').innerHTML = '';
  showView('listView');
  renderList(true);
}

/* ═══════════ 设置 ═══════════ */
function openSettings() {
  const s = state.settings;
  $('setNewWords').value = s.newWords;
  $('setRevWords').value = s.revWords;
  $('setNewPhrases').value = s.newPhrases;
  $('setRevPhrases').value = s.revPhrases;
  $('setNewPreps').value = s.newPreps;
  $('setRevPreps').value = s.revPreps;
  $('setOkSec').value = s.autoNextOk;
  $('setWrongSec').value = s.autoNextWrong;
  $('setRate').value = s.rate;
  $('rateVal').textContent = s.rate;
  $('setAutoSpeak').checked = s.autoSpeak;
  $('setTeachBlind').checked = !!s.teachBlind;
  $('setZhFirst').checked = s.zhReadFirstSense !== false;
  $('setSenseN').value = s.zhReadSenseN || 3;
  $('setZhPos').checked = s.zhSpeakPos !== false;
  $('setZhBlind').checked = !!s.zhBlind;
    $('setChunkHint').checked = !!s.chunkHint;
  $('setPauseNew').checked = !!s.pauseNewSettle;
  initVoices();
  $('settingsModal').classList.remove('hidden');
}
function applySettings() {
  const s = state.settings;
  const clamp = (v, lo, hi, def) => { v = parseInt(v); return isNaN(v) ? def : Math.min(hi, Math.max(lo, v)); };
  s.newWords = clamp($('setNewWords').value, 10, 1000, 300);
  s.revWords = clamp($('setRevWords').value, 50, 2000, 750);
  s.newPhrases = clamp($('setNewPhrases').value, 5, 300, 100);
  s.revPhrases = clamp($('setRevPhrases').value, 20, 1000, 200);
  s.newPreps = clamp($('setNewPreps').value, 1, 10, 2);
  s.revPreps = clamp($('setRevPreps').value, 2, 20, 5);
  s.autoNextOk = Math.min(10, Math.max(0.3, parseFloat($('setOkSec').value) || 0.75));
  s.autoNextWrong = Math.min(10, Math.max(0.5, parseFloat($('setWrongSec').value) || 1.5));
  s.rate = parseFloat($('setRate').value) || 0.9;
  s.autoSpeak = $('setAutoSpeak').checked;
  s.teachBlind = $('setTeachBlind').checked;
  s.zhReadFirstSense = $('setZhFirst').checked;
  s.zhReadSenseN = clamp($('setSenseN').value, 1, 10, 3);
  s.zhSpeakPos = $('setZhPos').checked;
  s.zhBlind = $('setZhBlind').checked;
    s.chunkHint = $('setChunkHint').checked;
  s.pauseNewSettle = $('setPauseNew').checked;
  s.voiceURI = $('setVoice').value;
  $('setNewWords').value = s.newWords; $('setRevWords').value = s.revWords;
  $('setNewPhrases').value = s.newPhrases; $('setRevPhrases').value = s.revPhrases;
  $('setOkSec').value = s.autoNextOk; $('setWrongSec').value = s.autoNextWrong;
  save();
}

/* ═══════════ 备份 ═══════════ */
function exportProgress() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wordapp-backup-${TODAY}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function importProgress(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = JSON.parse(r.result);
      if (!s.words || !s.phrases) throw new Error('bad');
      state = Object.assign(defaultState(), s, {
        settings: Object.assign(defaultSettings(), s.settings || {}),
      });
      ensureDay(); save(); renderHome();
      toast('导入成功');
    } catch (e) { toast('文件格式不对，导入失败'); }
  };
  r.readAsText(file);
}

/* ═══════════ 事件绑定 ═══════════ */
function bind() {
  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => switchPart(t.dataset.part)));

  // 测验题型（新学小测 / 每日复习 / 错题重做 通用）
  document.querySelectorAll('#modeRow .cchip').forEach(b =>
    b.addEventListener('click', () => {
      state.settings.quizMode = b.dataset.mode;
      save();
      document.querySelectorAll('#modeRow .cchip').forEach(x =>
        x.classList.toggle('active', x === b));
      // 会话进行中切换题型 → 立即改写本场后续未答题（当前题不动，下一题起生效）
      if (session && session.kind !== 'consolidate') {
        for (let i = session.idx + 1; i < session.queue.length; i++) {
          const it = session.queue[i];
          if (it.mode !== 'new') it.mode = state.settings.quizMode;
        }
      }
    }));

  $('btnStartNew').addEventListener('click', () => startSession('new'));
  $('btnStartReview').addEventListener('click', () => startSession('review'));
  $('btnQuit').addEventListener('click', () => { if (session) finishSession(); });
  $('btnBackHome').addEventListener('click', () => { showView('homeView'); renderHome(); });

  // 词书列表
  $('btnWordList').addEventListener('click', openList);
  $('btnCloseList').addEventListener('click', () => { showView('homeView'); renderHome(); });
  $('btnMore').addEventListener('click', () => renderList(false));
  $('btnPractice').addEventListener('click', () => startSession('extra'));
  document.querySelectorAll('#filterRow .filter-chip').forEach(c =>
    c.addEventListener('click', () => {
      listFilter = c.dataset.f;
      document.querySelectorAll('#filterRow .filter-chip').forEach(x =>
        x.classList.toggle('active', x === c));
      $('wordList').innerHTML = '';
      renderList(true);
    }));

  $('btnReplay').addEventListener('click', () => session && replaySpeak(session.replayItem || enForm(session.entry)));
  $('btnHint').addEventListener('click', () => {
    if (!session || !session.peekText) return;
    const qw = $('qWord');
    if (!session.peekOn) {
      session.peekOn = true;
      session.peekPlaceholder = qw.textContent;
      qw.textContent = session.peekText;
      qw.classList.remove('muted', 'blind');
    } else {
      session.peekOn = false;
      qw.textContent = session.peekPlaceholder;
      if (session.peekBlind) qw.classList.add('blind'); else qw.classList.add('muted');
    }
  });
  $('btnTeachSpeak').addEventListener('click', () => { if (session) replaySpeak(session.entry.w); });
  $('btnTaught').addEventListener('click', markTaught);
  $('btnGiveup2').addEventListener('click', giveupListen);
  $('btnReveal').addEventListener('click', () => {
    if (!session) return;
    curItem().revealed = true;
    $('listenMask').classList.add('hidden');
    $('choiceArea').innerHTML = session.options.map((o, i) =>
      `<button class="opt" data-i="${i}"><span class="key">${i + 1}</span>${esc(o.text)}</button>`).join('');
    $('choiceArea').classList.remove('hidden');
  });
  $('btnSpellSubmit').addEventListener('click', () => submitSpell(false));
  $('btnSpellGiveup').addEventListener('click', () => submitSpell(true));
  $('btnNext').addEventListener('click', () => { clearNextTimer(); session && nextQuestion(); });
  $('btnNextGroup').addEventListener('click', () => startSession('consolidate'));
  $('btnConsStart').addEventListener('click', () => {
    const p = state[part];
    const qt = state.settings.consQ;
    let round = consRoundOf(p);
    if (!round) {                                    // 今日还没有轮次 → 新开一轮（建全部题型轨道）
      round = startConsRound(p);
      if (!round) { toast('这个词范围还没有可练的词'); return; }
    }
    let tr = round.tracks[qt];
    const curPool = state.settings.consPool;
    if (!tr || tr.pool !== curPool) {                // 该题型没建过轨道，或范围换了 → 按当前范围（重）建轨道
      const pool = consPoolKeys(p).slice(0, state.settings.consSize || 15);
      if (!pool.length) { toast('这个词范围还没有可练的词'); return; }
      tr = round.tracks[qt] = { total: pool.length, done: 0, remaining: shuffle(pool.slice()), words: pool.slice(), pool: curPool };
      save();
    }
    if (tr.remaining.length) { startSession('consolidate'); return; }                // 继续/开始
    if (tr.done > 0) {                                                               // 本轮完成 → 询问重学
      const label = (document.querySelector(`#consQRow .cchip[data-v="${qt}"]`) || { dataset: { label: qt } }).dataset.label;
      $('consConfirmText').textContent = `「${label}」本轮的 ${tr.total} 个词已经练完一遍了，要把它们重新学一遍吗？（打乱顺序）`;
      $('consConfirm').classList.remove('hidden');
      return;
    }
    tr.remaining = shuffle(tr.words.slice());                                        // 轨道异常（空且没练过）→ 重置再进
    save();
    startSession('consolidate');
  });
  $('consRestart').addEventListener('click', () => {
    const p = state[part];
    const round = consRoundOf(p);
    const qt = state.settings.consQ;
    if (round && round.tracks[qt]) {
      const tr = round.tracks[qt];
      tr.remaining = shuffle(tr.words.slice());
      tr.done = 0;
      save();
    }
    $('consConfirm').classList.add('hidden');
    startSession('consolidate');
  });
  $('consCancel').addEventListener('click', () => $('consConfirm').classList.add('hidden'));
  $('consMask').addEventListener('click', () => $('consConfirm').classList.add('hidden'));
  // 巩固练习三行选择
  for (const [rowId, key, cast] of [['consPoolRow', 'consPool', String], ['consQRow', 'consQ', String], ['consSizeRow', 'consSize', Number]]) {
    document.querySelectorAll(`#${rowId} .cchip`).forEach(c =>
      c.addEventListener('click', () => {
        state.settings[key] = cast(c.dataset.v);
        save();
        renderCons(state[part]);
        // 巩固会话进行中切题型 → 立即改写本场后续未答题
        if (key === 'consQ' && session && session.kind === 'consolidate') {
          for (let i = session.idx + 1; i < session.queue.length; i++) {
            session.queue[i].mode = state.settings.consQ;
          }
        }
      }));
  }
  $('spellInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submitSpell(false); }
  });

  $('choiceArea').addEventListener('click', e => {
    if (e.target.id === 'btnChunkGiveup') { chunkGiveup(); return; }
    // 已放置的块/意象：点一下拿回来（多邻国式撤块），恢复词库按钮可再选
    const token = e.target.closest('.chunk-token');
    if (token && session && !session.answered) {
      const st = session.chunkState;
      const k = +token.dataset.p;
      const removed = st.picked.splice(k, 1);
      const bank = document.querySelector('#choiceArea .chunk-btn[data-i="' + removed[0].i + '"]');
      if (bank) { bank.disabled = false; bank.classList.remove('used'); }
      renderChunkBuilt();
      return;
    }
    const chunkBtn = e.target.closest('.chunk-btn');
    if (chunkBtn && !chunkBtn.disabled) {
      chunkBtn.disabled = true;
      chunkBtn.classList.add('used');
      const st = session.chunkState;
      st.picked.push({ i: +chunkBtn.dataset.i, text: chunkBtn.textContent });
      renderChunkBuilt();
      // 攒够真实块数 → 自动判分（干扰块会让"拼错/选错"成为可能）
      if (st.picked.length === (st.need || st.chunks.length)) {
        const isZh = st.type === 'zh';
        const built = st.picked.map(p => p.text).join(isZh ? '；' : '');
        const ok = isZh
          ? sameModules(st.picked.map(p => p.text), st.real)
          : normEn(built) === normEn(enForm(session.entry));   // 介词动词：块拼"abideby" = 答案"abide by"（normEn 宽松）
        stopAllAudio();
        session.answered = true;
        const doneItem = curItem();   // B01 衍生竞态修复：判分对象在点击时锁定（200ms 内按 Enter 翻题会让 curItem() 漂移到新题）
        setTimeout(() => {
          if (!session || curItem() !== doneItem) return;   // 仅防"已翻题"竞态（v6.35：删 gradedKeys 条件——它是整场累计集合，
          // 回队重考的词再答对会被误吞判分导致冻结，hamper 案；curItem 引用比对已足够防重复判分）
          applyResult(ok, doneItem,
            `${fbWordHtml(session.entry)}` +
            `<div class="fb-meaning">${esc(fullMeaning(session.entry))}</div>` +
            (ok ? '' : `<div class="fb-meaning" style="color:var(--red)">你${isZh ? '选' : '拼'}的是：${esc(built)}</div>`)
          );
          scheduleNext(autoNextMs(ok, 'chunk'));
        }, 200);
      }
      return;
    }
    const b = e.target.closest('.opt');
    if (b) answerChoice(+b.dataset.i);
  });

  // 键盘：1-4 选选项（选择题），Enter 进下一题
  document.addEventListener('keydown', e => {
    if (!session || $('sessionView').classList.contains('hidden')) return;
    const item = curItem();
    if (e.key === 'Enter' && session.answered) {
      if (item.mode === 'new' && !item.taught) { e.preventDefault(); markTaught(); return; }
      if ($('nextRow').classList.contains('hidden')) { e.preventDefault(); clearNextTimer(); nextQuestion(); }
      else { e.preventDefault(); clearNextTimer(); nextQuestion(); }
    }
    if (/^[1-4]$/.test(e.key) && !session.answered && item.mode !== 'new' && item.mode !== 'spell' && item.mode !== 'spellc' && item.mode !== 'chunk' && item.mode !== 'chunkMix' && item.mode !== 'zhChunk') {
      answerChoice(+e.key - 1);
    }
  });

  // 设置
  $('btnSettings').addEventListener('click', openSettings);
  const closeSettings = () => {
    applySettings();
    $('settingsModal').classList.add('hidden');
    // 会话进行中且当前题未作答 → 立即重渲染当前题，让"隐藏中文/隐藏英文"等开关马上生效
    if (session && !session.answered && $('sessionView') && !$('sessionView').classList.contains('hidden')) {
      stopAllAudio();   // v6.36：speak 的 append 修复后不再无条件清队列，重渲染前先停旧播，防提示音重复叠读
      renderQuestion();
    } else {
      renderHome();
    }
  };
  $('btnCloseSettings').addEventListener('click', closeSettings);
  document.querySelector('.modal-mask').addEventListener('click', closeSettings);
  $('setRate').addEventListener('input', () => { $('rateVal').textContent = $('setRate').value; });
  $('btnTestVoice').addEventListener('click', () => { applySettings(); replaySpeak('abandon, vocabulary, September'); });

  $('btnExport').addEventListener('click', exportProgress);
  $('btnImport').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', e => { if (e.target.files[0]) importProgress(e.target.files[0]); e.target.value = ''; });
  let resetArm = false;
  $('btnReset').addEventListener('click', () => {
    if (!resetArm) { resetArm = true; $('btnReset').textContent = '再点一次确认清空全部进度！'; setTimeout(() => { resetArm = false; $('btnReset').textContent = '重置全部进度'; }, 3000); return; }
    localStorage.removeItem(STORE_KEY);
    state = defaultState(); save();
    $('settingsModal').classList.add('hidden');
    renderHome(); toast('已重置');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    ensureDay();
    // 恢复后台暂停的看卡自动翻页
    if (session && session.pendingCard && curItem() === session.pendingCard && !session.answered) {
      const it = session.pendingCard; session.pendingCard = null;
      advanceCard(it);
      return;
    }
    session && (session.pendingCard = null);
    // 切回标签页：若正在答题则不打断；在首页时采纳服务端最新账本，防止旧内存覆盖
    if (!$('homeView').classList.contains('hidden')) {
      adoptServerState().then(() => { ensureDay(); renderHome(); });
    } else {
      renderHome();
    }
  });
}

/* ═══════════ 启动 ═══════════ */
function boot() {
  if (!window.IELTS_WORDS || !window.IELTS_WORDS.length) {
    document.body.innerHTML = '<p style="padding:40px;text-align:center">词库文件 data/ielts.js 加载失败，请确认整个 webapp 文件夹完整。</p>';
    return;
  }
  state = loadState();
  ensureDay();
  // 无到期词的空档日 → 直接自动划入新学词（每日必做只有复习）
  if (!Object.values(state.words.progress).some(p => p.added && p.due && p.due <= TODAY)) autoSettleNew();
  bind();
  if ('speechSynthesis' in window) {
    initVoices();
    speechSynthesis.onvoiceschanged = initVoices;
  }
  const vt = document.getElementById('verTag');
  if (vt) vt.textContent = ' · ' + APP_VER;
  renderHome();
  showView('homeView');
  adoptServerState().then(() => { renderHome(); });   // 先采用服务端唯一账本再刷新
  loadPlan().then(renderHome);   // 应用 AI 安排后刷新首页
  // 时钟驱动（v6.26）：每 5 秒刷新一次三枚芯片，预计时间随时间流逝自动演进；
  // 全局仅一个定时器、boot 启动一次；会话结束（finishSession）不清除，内部判空跳过
  setInterval(() => {
    if (!session || $('sessionView').classList.contains('hidden') || document.hidden) return;
    refreshChips();
  }, 5000);

  // 预生成读音是后台渐进生成的，每 2 分钟拉一次最新索引
  if (location.origin.startsWith('http')) {
    setInterval(() => {
      fetch('data/audio_index.js?_=' + Date.now())
        .then(r => r.text())
        .then(txt => {
          const m = txt.match(/window\.AUDIO_INDEX = (\{[\s\S]*?\});/)
          || txt.match(/window\.AUDIO_INDEX = (\{[\s\S]*\});/);
          if (m) window.AUDIO_INDEX = JSON.parse(m[1]);
          const m2 = txt.match(/window\.AUDIO_ZH = (\{[\s\S]*?\});/);
          if (m2) window.AUDIO_ZH = JSON.parse(m2[1]);
          const m3 = txt.match(/window\.AUDIO_ZHC = (\{[\s\S]*?\});/);
          if (m3) window.AUDIO_ZHC = JSON.parse(m3[1]);
          const m4 = txt.match(/window\.AUDIO_SENSE = (\{[\s\S]*?\});/);
          if (m4) window.AUDIO_SENSE = JSON.parse(m4[1]);
          const m5 = txt.match(/window\.AUDIO_POS = (\{[\s\S]*?\});/);
          if (m5) window.AUDIO_POS = JSON.parse(m5[1]);
        })
        .catch(() => {});
    }, 120000);
  }
}
boot();
