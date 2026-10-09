/* ckm 批次校验器：node tools/ckm_check.js NN
   校验 tools/v2_out/chk_NN.json（词根词缀制 [[块,义],...]）：
   1) JSON 可解析；输出词集合 == 输入词集合（不多不少）
   2) 每词块数 1~4；每块二元数组 [块文本, 块义]
   3) 块文本非空；join('') === 原词（逐字符）
   4) 块义纯中文 0~6 字（允许空串），禁符号
   5) 单块词块义应为空串；多块词每块块义非空 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const n = String(process.argv[2]).padStart(2, '0');
const inFile = path.join(ROOT, 'tools/v2_batches/chk_' + n + '.json');
const outFile = path.join(ROOT, 'tools/v2_out/chk_' + n + '.json');
if (!fs.existsSync(outFile)) { console.log('FAIL 缺输出 ' + outFile); process.exit(1); }
let out, inp;
try { out = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { console.log('FAIL 输出JSON解析失败: ' + e.message); process.exit(1); }
try { inp = JSON.parse(fs.readFileSync(inFile, 'utf8')); } catch (e) { console.log('FAIL 输入文件异常: ' + e.message); process.exit(1); }
const inSet = new Set(inp), outKeys = Object.keys(out);
const BAN = /[()（）\[\]【】…‥=/、;；,，]/;
const ZH = /^[一-鿿]{0,6}$/;
let errs = 0, multi = 0, single = 0;
const err = m => { if (errs < 20) console.log('FAIL ' + m); errs++; };
for (const k of outKeys) if (!inSet.has(k)) err('多余词 ' + k);
for (const w of inp) {
  if (!(w in out)) { err('缺词 ' + w); continue; }
  const blocks = out[w];
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > 4) { err(`${w} 块数 ${blocks && blocks.length}`); continue; }
  if (blocks.length === 1) single++; else multi++;
  const join = [];
  for (const b of blocks) {
    if (!Array.isArray(b) || b.length !== 2) { err(`${w} 块非二元组: ${JSON.stringify(b)}`); continue; }
    const [t, g] = b;
    if (typeof t !== 'string' || !t) { err(`${w} 空块文本`); continue; }
    join.push(t);
    if (typeof g !== 'string') { err(`${w} 块义非字符串`); continue; }
    if (!ZH.test(g)) { err(`${w} 块义不合规: ${JSON.stringify(g)}`); continue; }
    if (blocks.length > 1 && !g) { err(`${w} 多块词块义为空: ${t}`); continue; }
  }
  const joined = join.join('');
  if (joined !== w) err(`拼接不还原: ${w} -> ${joined}`);
}
if (errs) { console.log(`RESULT FAIL errors=${errs}`); process.exit(1); }
console.log(`RESULT OK 词=${outKeys.length} 多块=${multi} 单块=${single}`);
