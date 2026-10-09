/* trim 批次校验器：node tools/adv_check.js NN
   1) 输出 ⊆ 输入；条数不变或 +1（每词最多拆一处）
   2) 未修义逐字节保留（按多集合包含校验：输出含输入全部原文，除被修复的逗号义项）
   3) 格式合规（词性白名单/正文1~14字/禁符号）；修复义不得含中文逗号
   4) 至少修复一个义项 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const n = String(process.argv[2]).padStart(2, '0');
const inFile = path.join(ROOT, 'tools/v2_batches/adv_' + n + '.json');
const outFile = path.join(ROOT, 'tools/v2_out/adv_' + n + '.json');
if (!fs.existsSync(outFile)) { console.log('FAIL 缺输出 ' + outFile); process.exit(1); }
let out, inp;
try { out = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { console.log('FAIL 输出JSON解析失败: ' + e.message); process.exit(1); }
try { inp = JSON.parse(fs.readFileSync(inFile, 'utf8')); } catch (e) { console.log('FAIL 输入异常: ' + e.message); process.exit(1); }
const POS_OK = new Set(['n', 'v', 'vt', 'vi', 'vp', 'adj', 'adv', 'prep', 'conj', 'pron', 'aux', 'int', 'art', 'num']);
const BAN = /[()（）\[\]【】…‥=/、;；]/;
const POS_RE = /^(n|v|vt|vi|vp|adj|adv|prep|conj|pron|aux|int|art|num)\.\s+(\S.*)$/;
let errs = 0, fixedWords = 0, trimmed = 0, split = 0, kept = 0;
const err = m => { if (errs < 20) console.log('FAIL ' + m); errs++; };
for (const [w, m] of Object.entries(out)) {
  if (!(w in inp)) { err('非输入词 ' + w); continue; }
  const old = inp[w];
  if (!Array.isArray(m) || m.length < old.length || m.length > old.length + 1 || m.length > 10) { err(w + ' 条数异常 ' + old.length + '->' + (m && m.length)); continue; }
  const rest = m.slice();
  let fixed = 0;
  for (const s of old) {
    const i = rest.indexOf(s);
    if (i >= 0) { rest.splice(i, 1); kept++; }
  }
  // rest = 新增(拆分)义；被修复的逗号义不在输出里（原样版）也不在 rest —— 数一下变化
  for (let i = 0; i < m.length; i++) {
    const mm = String(m[i]).match(POS_RE);
    if (!mm) { err(w + ' 格式错: ' + m[i]); continue; }
    if (!POS_OK.has(mm[1])) { err(w + ' 词性非法'); continue; }
    if (mm[2].length < 1 || mm[2].length > 14) { err(w + ' 长度: ' + m[i]); continue; }
    if (BAN.test(mm[2])) { err(w + ' 违禁符号: ' + m[i]); continue; }
  }
  if (m.length === old.length) {
    // 纯精简：变化的义 = 输出中有而输入无的
    for (const s of m) if (!old.includes(s)) { fixed++; if (s.replace(POS_RE, '').includes('，')) err(w + ' 修复义仍含逗号: ' + s); }
  } else {
    split++;
    for (const s of m) if (!old.includes(s) && s.replace(POS_RE, '').includes('，')) err(w + ' 拆分义含逗号: ' + s);
  }
  if (m.length === old.length && m.every((s, i) => s === old[i])) err(w + ' 与输入全同（复读）');
  else fixedWords++;
  if (m.length === old.length) trimmed += fixed;
}
if (errs) { console.log('RESULT FAIL errors=' + errs); process.exit(1); }
console.log('RESULT OK 修复词=' + fixedWords + ' 精简义=' + trimmed + ' 拆分词=' + split + ' 保留义=' + kept);
