/* 词义审核切批：全 9388 词 → tools/v2_batches/aud_01~12.json（{"词": [m...]}）
   node tools/cut_aud_batches.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sb = { window: {} };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'webapp/data/ielts.js'), 'utf8'), sb);
const words = sb.window.IELTS_WORDS;
const B = Math.ceil(words.length / 12);
for (let i = 0; i < 12; i++) {
  const part = {};
  for (const w of words.slice(i * B, (i + 1) * B)) part[w.w] = w.m;
  const f = path.join(ROOT, 'tools/v2_batches/aud_' + String(i + 1).padStart(2, '0') + '.json');
  fs.writeFileSync(f, JSON.stringify(part, null, 0), 'utf8');
  console.log('aud_' + String(i + 1).padStart(2, '0') + '.json: ' + Object.keys(part).length + ' 词');
}
console.log('total:', words.length);
