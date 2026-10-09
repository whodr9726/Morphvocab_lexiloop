/* loss 批次校验器：node tools/loss_check.js NN
   1) JSON 可解析；输出词集合 ⊆ 输入候选集合
   2) 每词 m 数组 1~10 条；每条 "词性. 正文"，词性白名单，正文 1~14 字，禁符号
   3) cur 的每一条必须在输出中逐字节出现（不许删旧义）
   4) 新增条数 1~3；禁止新增 vp. 义 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const n = String(process.argv[2]).padStart(2, '0');
const inFile = path.join(ROOT, 'tools/v2_batches/loss_' + n + '.json');
const outFile = path.join(ROOT, 'tools/v2_out/loss_' + n + '.json');
if (!fs.existsSync(outFile)) { console.log('FAIL 缺输出 ' + outFile); process.exit(1); }
let out, inp;
try { out = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { console.log('FAIL 输出JSON解析失败: ' + e.message); process.exit(1); }
try { inp = JSON.parse(fs.readFileSync(inFile, 'utf8')); } catch (e) { console.log('FAIL 输入文件异常: ' + e.message); process.exit(1); }
const POS_OK = new Set(['n', 'v', 'vt', 'vi', 'adj', 'adv', 'prep', 'conj', 'pron', 'aux', 'int', 'art', 'num']);
const BAN = /[()（）\[\]【】…‥=/、;；]/;
const POS_RE = /^(n|v|vt|vi|vp|adj|adv|prep|conj|pron|aux|int|art|num)\.\s+(\S.*)$/;
let errs = 0, fixed = 0, added = 0;
const err = m => { if (errs < 20) console.log('FAIL ' + m); errs++; };
for (const [w, m] of Object.entries(out)) {
  if (!(w in inp)) { err('非候选词 ' + w); continue; }
  if (!Array.isArray(m) || m.length < 1 || m.length > 10) { err(w + ' 义项数 ' + (m && m.length)); continue; }
  const cur = inp[w].cur;
  const rest = m.slice();
  let missing = 0;
  for (const s of cur) {
    const i = rest.indexOf(s);
    if (i < 0) { if (missing < 3) err(w + ' 旧义被删/被改: ' + s); missing++; }
    else rest.splice(i, 1);
  }
  if (missing) continue;
  if (rest.length < 1 || rest.length > 3) { err(w + ' 新增条数 ' + rest.length + '（须1~3）'); continue; }
  for (const s of m) {
    const mm = String(s).match(POS_RE);
    if (!mm) { err(w + ' 义项格式错: ' + s); continue; }
    if (!POS_OK.has(mm[1])) { err(w + ' 词性非法: ' + mm[1]); continue; }
    if (mm[2].length < 1 || mm[2].length > 14) { err(w + ' 正文长度: ' + s); continue; }
    if (BAN.test(mm[2])) { err(w + ' 违禁符号: ' + s); continue; }
  }
  for (const s of rest) {
    const mm = String(s).match(POS_RE);
    if (mm && mm[1] === 'vp') err(w + ' 禁止新增 vp 义: ' + s);
  }
  fixed++; added += rest.length;
}
if (errs) { console.log('RESULT FAIL errors=' + errs); process.exit(1); }
console.log('RESULT OK 补义词=' + fixed + ' 新增义=' + added);
