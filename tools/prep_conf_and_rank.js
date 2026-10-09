const fs = require('fs'); const vm = require('vm'); const path = require('path');
const ROOT = __dirname;
const sb = { window: {} }; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, '../webapp/data/ielts.js'), 'utf8'), sb);
const words = sb.window.IELTS_WORDS;
const POS = /^(n|v|vt|vi|vp|adj|adv|prep|conj|pron|aux|int|art|num)\.\s+/;
const byText = new Map(); // text -> [{w,pos}]
for (const w of words) for (const s of w.m) {
  const mm = s.match(POS); if (!mm) continue;
  const t = s.slice(mm[0].length);
  if (!byText.has(t)) byText.set(t, []);
  byText.get(t).push({ w: w.w, pos: mm[1] });
}
// 碰撞组：同文本下，涉事词性包含 (n vs v/vi) 或 (adv 无地 vs 其他)
const pairs = []; const wordSet = new Set();
for (const [t, arr] of byText) {
  const poss = new Set(arr.map(a => a.pos));
  const hasN = poss.has('n'), hasV = poss.has('v') || poss.has('vi'), hasAdv = poss.has('adv');
  const verbEntries = arr.filter(a => a.pos === 'v' || a.pos === 'vi');
  const nounEntries = arr.filter(a => a.pos === 'n');
  const verbNoSlot = verbEntries.some(a => { const e = words.find(x => x.w === a.w); const s = (e.m || []).find(x => x.replace(POS, '') === t); return s && !/某/.test(s); });
  if (hasN && hasV && verbNoSlot) {
    pairs.push({ text: t, hits: arr.map(a => a.w + ' ' + a.pos + '.').join(' / ') });
    arr.forEach(a => wordSet.add(a.w));
  } else if (hasAdv && !t.endsWith('地') && poss.size > 1) {
    pairs.push({ text: t, hits: arr.map(a => a.w + ' ' + a.pos + '.').join(' / ') });
    arr.forEach(a => wordSet.add(a.w));
  }
}
fs.writeFileSync(path.join(ROOT, 'v2_batches/aud_13_pairs.txt'),
  '# 碰撞对照表（释义文本完全相同、词性易混的组）：文本 | 涉事词/词性\n' +
  pairs.map(p => p.text + ' | ' + p.hits).join('\n'), 'utf8');
// aud_13 输入：涉事词全集当前 m
const dict = {};
for (const w of words) if (wordSet.has(w.w)) dict[w.w] = w.m;
fs.writeFileSync(path.join(ROOT, 'v2_batches/aud_13.json'), JSON.stringify(dict), 'utf8');
console.log('碰撞组:', pairs.length, '| 涉事词:', Object.keys(dict).length);
// rank 切批：index >= 3139 的词
const CUR = 3139;
const tail = words.slice(CUR).map(w => w.w);
console.log('待排序词(已学段之后):', tail.length);
const B = Math.ceil(tail.length / 14);
for (let i = 0; i < 14; i++) {
  const part = tail.slice(i * B, (i + 1) * B);
  if (!part.length) continue;
  fs.writeFileSync(path.join(ROOT, 'v2_batches/rank_' + String(i + 1).padStart(2, '0') + '.json'), JSON.stringify(part), 'utf8');
  console.log('rank_' + String(i + 1).padStart(2, '0') + '.json:', part.length, '词');
}
