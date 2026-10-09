/* aud 批次校验器：node tools/dup_check.js NN
   校验 tools/v2_out/dup_NN.json：
   1) JSON 可解析，非空对象（空对象=本批全合格，合法，输出 OK 0）
   2) 每个词必须存在于输入 tools/v2_batches/dup_NN.json
   3) 义项条数与输入一致；m 长度 1~10
   4) 每条义项 "词性. 正文"，词性白名单，正文 1~14 字，禁符号
   5) 至少一个义项与输入不同（纯复读的词打回） */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const n = String(process.argv[2]).padStart(2, '0');
const inFile = path.join(ROOT, 'tools/v2_batches/dup_' + n + '.json');
const outFile = path.join(ROOT, 'tools/v2_out/dup_' + n + '.json');
if (!fs.existsSync(outFile)) { console.log('FAIL 缺输出 ' + outFile); process.exit(1); }
let out, inp;
try { out = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { console.log('FAIL 输出JSON解析失败: ' + e.message); process.exit(1); }
try { inp = JSON.parse(fs.readFileSync(inFile, 'utf8')); } catch (e) { console.log('FAIL 输入文件异常: ' + e.message); process.exit(1); }
const POS_OK = new Set(['n','v','vt','vi','vp','adj','adv','prep','conj','pron','aux','int','art','num']);
const BAN = /[()（）\[\]【】…‥=/、;；]/;
const POS_RE = /^(n|v|vt|vi|vp|adj|adv|prep|conj|pron|aux|int|art|num)\.\s+(\S.*)$/;
let errs = 0, fixedWords = 0, changedSenses = 0, keptSame = 0;
const err = m => { if (errs < 20) console.log('FAIL ' + m); errs++; };
for (const [w, m] of Object.entries(out)) {
  if (!(w in inp)) { err(`多余词 ${w}`); continue; }
  if (!Array.isArray(m) || m.length < 1 || m.length > 10) { err(`${w} 义项数 ${m && m.length}`); continue; }
  if (m.length !== inp[w].length) { err(`${w} 义项数 ${m.length} != 输入 ${inp[w].length}（铁律2）`); continue; }
  let diff = 0;
  for (let i = 0; i < m.length; i++) {
    const mm = String(m[i]).match(POS_RE);
    if (!mm) { err(`${w} 义项格式错: ${m[i]}`); continue; }
    if (!POS_OK.has(mm[1])) { err(`${w} 词性非法: ${mm[1]}`); continue; }
    const t = mm[2];
    if (t.length < 1 || t.length > 14) { err(`${w} 正文长度 ${t.length}: ${t}`); continue; }
    if (BAN.test(t)) { err(`${w} 违禁符号: ${t}`); continue; }
    if (m[i] === inp[w][i]) keptSame++; else { diff++; changedSenses++; }
  }
  if (diff === 0) err(`${w} 与输入完全相同（纯复读，不许出现在输出）`);
  else fixedWords++;
}
if (errs) { console.log(`RESULT FAIL errors=${errs}`); process.exit(1); }
console.log(`RESULT OK 改写词=${fixedWords} 改写义项=${changedSenses} 保留原样义项=${keptSame}`);
