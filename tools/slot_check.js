/* slot 批次校验器：node tools/slot_check.js NN
   1) 输出 ⊆ 输入；条数一致；未修义逐字节保留
   2) 修复义格式合规（词性白名单/正文1~14字/禁符号）
   3) 修复后 vt. 义必须含"某"（除非该义标签改成 vi./v.）
   4) 至少修了一个义（纯复读打回） */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const n = String(process.argv[2]).padStart(2, '0');
const inFile = path.join(ROOT, 'tools/v2_batches/slot_' + n + '.json');
const outFile = path.join(ROOT, 'tools/v2_out/slot_' + n + '.json');
if (!fs.existsSync(outFile)) { console.log('FAIL 缺输出 ' + outFile); process.exit(1); }
let out, inp;
try { out = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { console.log('FAIL 输出JSON解析失败: ' + e.message); process.exit(1); }
try { inp = JSON.parse(fs.readFileSync(inFile, 'utf8')); } catch (e) { console.log('FAIL 输入异常: ' + e.message); process.exit(1); }
const POS_OK = new Set(['n', 'v', 'vt', 'vi', 'vp', 'adj', 'adv', 'prep', 'conj', 'pron', 'aux', 'int', 'art', 'num']);
const BAN = /[()（）\[\]【】…‥=/、;；]/;
const POS_RE = /^(n|v|vt|vi|vp|adj|adv|prep|conj|pron|aux|int|art|num)\.\s+(\S.*)$/;
let errs = 0, fixedWords = 0, fixedSenses = 0, kept = 0;
const err = m => { if (errs < 20) console.log('FAIL ' + m); errs++; };
for (const [w, m] of Object.entries(out)) {
  if (!(w in inp)) { err('非输入词 ' + w); continue; }
  if (!Array.isArray(m) || m.length !== inp[w].length) { err(w + ' 条数不一致'); continue; }
  let fixed = 0;
  for (let i = 0; i < m.length; i++) {
    const mm = String(m[i]).match(POS_RE);
    if (!mm) { err(w + ' 格式错: ' + m[i]); continue; }
    if (!POS_OK.has(mm[1])) { err(w + ' 词性非法: ' + mm[1]); continue; }
    if (mm[2].length < 1 || mm[2].length > 14) { err(w + ' 长度: ' + m[i]); continue; }
    if (BAN.test(mm[2])) { err(w + ' 违禁符号: ' + m[i]); continue; }
    if (m[i] !== inp[w][i]) {
      fixed++;
      if (mm[1] === 'vt' && !/某/.test(mm[2])) err(w + ' vt 修复后仍无槽: ' + m[i]);
    } else kept++;
  }
  if (fixed === 0) err(w + ' 与输入全同（复读）');
  else { fixedWords++; fixedSenses += fixed; }
}
if (errs) { console.log('RESULT FAIL errors=' + errs); process.exit(1); }
console.log('RESULT OK 修复词=' + fixedWords + ' 修复义=' + fixedSenses + ' 保留义=' + kept);
