const fs = require('fs'); const vm = require('vm');
const sb = { window: {} }; vm.createContext(sb);
vm.runInContext(fs.readFileSync('webapp/data/ielts.js', 'utf8'), sb);
const words = sb.window.IELTS_WORDS;
const POS = /^[a-z.]+\s+/;
const byText = {};
for (const w of words) for (const s of w.m) {
  const t = s.replace(POS, '');
  if (!t) continue;
  (byText[t] = byText[t] || []).push(w.w);
}
// 连通分量：同文词并查集
const parent = {};
const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
for (const w of words) parent[w.w] = w.w;
for (const [t, arr] of Object.entries(byText)) {
  const uniq = [...new Set(arr)];
  for (let i = 1; i < uniq.length; i++) parent[find(uniq[0])] = find(uniq[i]);
}
const comps = {};
for (const w of words) {
  if (!byText._wordHasDup) byText._wordHasDup = {};
  (comps[find(w.w)] = comps[find(w.w)] || []).push(w.w);
}
// 只留含重复文的分量
const dupComps = [];
for (const [root, arr] of Object.entries(comps)) {
  const texts = new Set();
  for (const w of arr) for (const s of (words.find(x => x.w === w).m)) { const t = s.replace(POS, ''); if (byText[t] && new Set(byText[t]).size > 1) texts.add(t); }
  if (texts.size > 0 || arr.length > 1) {
    // 分量里必须真有同文：检查任一文本被分量内 ≥2 词共享
    let real = false;
    for (const w of arr) for (const s of (words.find(x => x.w === w).m)) {
      const t = s.replace(POS, '');
      const holders = new Set(byText[t] || []);
      if ([...arr].filter(a => holders.has(a)).length >= 2) real = true;
    }
    if (real) dupComps.push({ words: arr, texts: [...texts] });
  }
}
console.log('重复连通分量:', dupComps.length, '| 涉及词:', dupComps.reduce((a, c) => a + c.words.length, 0));
// 均分 3 批（按分量）
const B = [[], [], []];
const counts = [0, 0, 0];
for (const c of dupComps.sort((a, b) => b.words.length - a.words.length)) {
  const i = counts.indexOf(Math.min(...counts));
  B[i].push(c); counts[i] += c.words.length;
}
const byw = {}; words.forEach(x => byw[x.w] = x.m);
for (let i = 0; i < 3; i++) {
  const dict = {}; const pairs = [];
  for (const c of B[i]) {
    for (const w of c.words) dict[w] = byw[w];
    for (const t of c.texts) pairs.push(t + ' | ' + [...new Set(byText[t])].join(' / '));
  }
  const nn = String(i + 1).padStart(2, '0');
  fs.writeFileSync('tools/v2_batches/dup_' + nn + '.json', JSON.stringify(dict), 'utf8');
  fs.writeFileSync('tools/v2_batches/dup_' + nn + '_pairs.txt', [...new Set(pairs)].join('\n'), 'utf8');
  console.log('dup_' + nn + ':', Object.keys(dict).length, '词,', new Set(pairs).size, '组');
}
