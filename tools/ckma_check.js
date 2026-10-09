/* ckma 批次校验器：node tools/ckma_check.js N
   校验 tools/v2_out/ckma_0N.json（拆块补全审核输出，只含需改词）：
   1) JSON 可解析；输出词集合 ⊆ 输入候选集合
   2) 每词 [[块,义],...] 二元组、块数 1~4、块文本非空
   3) join('') === 词（逐字符）
   4) 块义纯中文 0~6 字；多块词每块块义非空
   5) 与输入现块不同（纯复读打回） */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const n = String(process.argv[2]);
const inFile = path.join(ROOT, 'tools/v2_batches/ckma_0' + n + '.json');
const outFile = path.join(ROOT, 'tools/v2_out/ckma_0' + n + '.json');
if (!fs.existsSync(outFile)) { console.log('FAIL 缺输出 ' + outFile); process.exit(1); }
let out, inp;
try { out = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { console.log('FAIL 输出JSON解析失败: ' + e.message); process.exit(1); }
try { inp = JSON.parse(fs.readFileSync(inFile, 'utf8')); } catch (e) { console.log('FAIL 输入文件异常: ' + e.message); process.exit(1); }
const ZH = /^[一-鿿]{0,6}$/;
let errs = 0, changed = 0;
const err = m => { if (errs < 20) console.log('FAIL ' + m); errs++; };
for (const [w, blocks] of Object.entries(out)) {
  if (!(w in inp)) { err('非候选词 ' + w); continue; }
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > 4) { err(w + ' 块数 ' + (blocks && blocks.length)); continue; }
  const join = [];
  for (const b of blocks) {
    if (!Array.isArray(b) || b.length !== 2 || typeof b[0] !== 'string' || !b[0]) { err(w + ' 块形异常 ' + JSON.stringify(b)); continue; }
    if (typeof b[1] !== 'string' || !ZH.test(b[1])) { err(w + ' 块义不合规 ' + JSON.stringify(b[1])); continue; }
    if (blocks.length > 1 && !b[1]) { err(w + ' 多块词块义为空'); continue; }
    join.push(b[0]);
  }
  if (join.join('') !== w) err('拼接不还原: ' + w + ' -> ' + join.join(''));
  if (JSON.stringify(blocks) === JSON.stringify(inp[w])) err(w + ' 与现块完全相同（复读，不该出现在输出）');
  else changed++;
}
if (errs) { console.log('RESULT FAIL errors=' + errs); process.exit(1); }
console.log('RESULT OK 改拆词=' + changed);
