/* de/vi 批次校验器：node tools/de_check.js <prefix> <N>
   规则：输出 ⊆ 输入、条数一致、未修义逐字节保留、格式合规；
   de 前缀：修改义必须以「地」结尾；vi 前缀：修改义不得含「某」。 */
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const kind = process.argv[2], n = String(process.argv[3]).padStart(2, '0');
const inFile = path.join(ROOT, 'tools/v2_batches', kind + '_' + n + '.json');
const outFile = path.join(ROOT, 'tools/v2_out', kind + '_' + n + '.json');
if (!fs.existsSync(outFile)) { console.log('FAIL 缺输出 ' + outFile); process.exit(1); }
let out, inp;
try { out = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { console.log('FAIL JSON: ' + e.message); process.exit(1); }
try { inp = JSON.parse(fs.readFileSync(inFile, 'utf8')); } catch (e) { console.log('FAIL 输入: ' + e.message); process.exit(1); }
const POS_OK = new Set(['n','v','vt','vi','vp','adj','adv','prep','conj','pron','aux','int','art','num']);
const BAN = /[()（）\[\]【】…‥=/、;；]/;
const POS_RE = /^(n|v|vt|vi|vp|adj|adv|prep|conj|pron|aux|int|art|num)\.\s+(\S.*)$/;
let errs = 0, fixedWords = 0, fixedSenses = 0, kept = 0;
const err = m => { if (errs < 20) console.log('FAIL ' + m); errs++; };
for (const [w, m] of Object.entries(out)) {
  if (!(w in inp)) { err('非输入词 ' + w); continue; }
  if (!Array.isArray(m) || m.length !== inp[w].length) { err(w + ' 条数不一致'); continue; }
  for (let i = 0; i < m.length; i++) {
    const mm = String(m[i]).match(POS_RE);
    if (!mm) { err(w + ' 格式错: ' + m[i]); continue; }
    if (!POS_OK.has(mm[1])) { err(w + ' 词性非法'); continue; }
    if (mm[2].length < 1 || mm[2].length > 14) { err(w + ' 长度: ' + m[i]); continue; }
    if (BAN.test(mm[2])) { err(w + ' 违禁符号: ' + m[i]); continue; }
    if (m[i] !== inp[w][i]) {
      fixedSenses++;
      if (kind === 'de' && mm[1] === 'adv' && !mm[2].endsWith('地')) err(w + ' 修改的副词义未以地结尾: ' + m[i]);
      if (kind === 'vi' && /某/.test(mm[2])) err(w + ' vi 修改义含某槽: ' + m[i]);
      if (kind === 'nn' && mm[1] === 'n' && (/某/.test(mm[2]) || /地$/.test(mm[2]))) err(w + ' nn 修改义违规（某/地）: ' + m[i]);
    } else kept++;
  }
  if (m.every((s, i) => s === inp[w][i])) err(w + ' 与输入全同');
  else fixedWords++;
}
if (errs) { console.log('RESULT FAIL errors=' + errs); process.exit(1); }
console.log('RESULT OK 修复词=' + fixedWords + ' 修复义=' + fixedSenses + ' 保留=' + kept);
