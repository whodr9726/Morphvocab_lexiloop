const fs = require('fs'); const vm = require('vm');
const sb = { window: {} }; vm.createContext(sb);
vm.runInContext(fs.readFileSync('webapp/data/ielts.js', 'utf8'), sb);
const words = sb.window.IELTS_WORDS;
const POS = /^(n|v|vt|vi|vp|adj|adv|prep|conj|pron|aux|int|art|num)\.\s+/;
// 类A：同词内 n 义与 v/vi 义文本完全相同（听到中文无法辨名动）
let sameNV = [];
for (const w of words) {
  const ns = [], vs = [];
  for (const s of w.m) {
    const mm = s.match(POS); if (!mm) continue;
    const t = s.slice(mm[0].length);
    if (mm[1] === 'n') ns.push(t); else if (mm[1] === 'v' || mm[1] === 'vi') vs.push(t);
  }
  for (const n of ns) if (vs.includes(n)) sameNV.push(w.w + ' | ' + n);
}
console.log('类A 同词动名同文:', sameNV.length);
console.log(sameNV.slice(0, 25).join('\n'));
// 类B：副词义（不带地）与同词或跨词 n/adj/v 义同文
const textToOther = new Map(); // text -> 首个非adv词性词
let advSame = [];
for (const w of words) for (const s of w.m) {
  const mm = s.match(POS); if (!mm) continue;
  const t = s.slice(mm[0].length);
  if (mm[1] === 'adv') {
    if (!/地$/.test(t)) {
      if (textToOther.has(t)) advSame.push(w.w + ' | adv. ' + t + ' ↔ ' + textToOther.get(t));
    }
  } else if (!textToOther.has(t)) textToOther.set(t, w.w + ' ' + mm[1] + '. ' + t);
}
console.log('类B 无地副词与他词性同文:', advSame.length);
console.log(advSame.slice(0, 20).join('\n'));
// 类C：vi 义无槽且与库内名词义同文（跨词，如 rise vi上升 vs ascent n上升）规模大，只统计
let crossVN = 0, samples = [];
const nounTexts = new Set();
for (const w of words) for (const s of w.m) { const mm = s.match(POS); if (mm && mm[1] === 'n') nounTexts.add(s.slice(mm[0].length)); }
for (const w of words) for (const s of w.m) {
  const mm = s.match(POS); if (!mm || !(mm[1] === 'v' || mm[1] === 'vi')) continue;
  const t = s.slice(mm[0].length);
  if (!/某/.test(s) && nounTexts.has(t)) { crossVN++; if (samples.length < 15) samples.push(w.w + ' | ' + s); }
}
console.log('类C 无槽动词义与库内名词义同文(跨词):', crossVN);
console.log(samples.join('\n'));
