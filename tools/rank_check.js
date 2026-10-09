/* rank 批次校验器：node tools/rank_check.js NN
   1) JSON 可解析；输出词集合 == 输入词集合
   2) 档位只能是 A1/A2/B1/B2/C1/C2/D */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const n = String(process.argv[2]).padStart(2, '0');
const inFile = path.join(ROOT, 'tools/v2_batches/rank_' + n + '.json');
const outFile = path.join(ROOT, 'tools/v2_out/rank_' + n + '.json');
if (!fs.existsSync(outFile)) { console.log('FAIL 缺输出 ' + outFile); process.exit(1); }
let out, inp;
try { out = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { console.log('FAIL 输出JSON解析失败: ' + e.message); process.exit(1); }
try { inp = JSON.parse(fs.readFileSync(inFile, 'utf8')); } catch (e) { console.log('FAIL 输入文件异常: ' + e.message); process.exit(1); }
const TIERS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D']);
let errs = 0; const dist = {};
const err = m => { if (errs < 20) console.log('FAIL ' + m); errs++; };
const inSet = new Set(inp);
for (const k of Object.keys(out)) {
  if (!inSet.has(k)) { err('多余词 ' + k); continue; }
  if (!TIERS.has(out[k])) { err(k + ' 档位非法: ' + JSON.stringify(out[k])); continue; }
  dist[out[k]] = (dist[out[k]] || 0) + 1;
}
for (const w of inp) if (!(w in out)) err('缺词 ' + w);
if (errs) { console.log('RESULT FAIL errors=' + errs); process.exit(1); }
console.log('RESULT OK 词=' + Object.keys(out).length + ' 分布=' + JSON.stringify(dist));
