/* vpsp 批次校验器：node tools/vpsp_check.js NN
   1) 输出词集合 == 输入词集合
   2) new_m = 原 m 去掉 vp. 义（逐字节、原序）
   3) vp_entries：form = 母词+空格+该组介词；每组 m ⊆ 原 vp 义且按介词正确分组；并集 == 原 vp 义全集
   4) tier ∈ A1/A2/B1/B2/C1/C2/D
   5) chunks：二元组、拼接==form、1~4 块、多块块义非空纯中文 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const n = String(process.argv[2]).padStart(2, '0');
const inFile = path.join(ROOT, 'tools/v2_batches/vpsp_' + n + '.json');
const outFile = path.join(ROOT, 'tools/v2_out/vpsp_' + n + '.json');
if (!fs.existsSync(outFile)) { console.log('FAIL 缺输出 ' + outFile); process.exit(1); }
let out, inp;
try { out = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { console.log('FAIL 输出JSON解析失败: ' + e.message); process.exit(1); }
try { inp = JSON.parse(fs.readFileSync(inFile, 'utf8')); } catch (e) { console.log('FAIL 输入异常: ' + e.message); process.exit(1); }
const TIERS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D']);
const ZH = /^[一-鿿]{0,6}$/;
let errs = 0, mothers = 0, entries = 0;
const err = m => { if (errs < 20) console.log('FAIL ' + m); errs++; };
for (const w of Object.keys(inp)) if (!(w in out)) err('缺词 ' + w);
for (const w of Object.keys(out)) {
  if (!(w in inp)) { err('多余词 ' + w); continue; }
  const { m: orig, vp } = inp[w];
  const vpIdx = new Set(Object.keys(vp).map(Number));
  const vpSenses = orig.filter((_, i) => vpIdx.has(i));
  const otherSenses = orig.filter((_, i) => !vpIdx.has(i));
  const r = out[w];
  if (JSON.stringify(r.new_m) !== JSON.stringify(otherSenses)) err(w + ' new_m != 原义减 vp（逐字节/原序）');
  // 纯 vp 词（无其他词性义）：new_m 允许为空数组 = 母词整词消失
  if (!Array.isArray(r.vp_entries) || r.vp_entries.length < 1) { err(w + ' 无 vp_entries'); continue; }
  mothers++;
  const used = [];
  for (const e of r.vp_entries) {
    entries++;
    if (typeof e.form !== 'string' || !e.form.includes(' ')) { err(w + ' form 异常: ' + e.form); continue; }
    const prep = e.form.split(' ').pop();
    const validPreps = new Set(Object.values(vp));
    if (!validPreps.has(prep)) { err(w + ' 介词不在 vp 表: ' + prep); continue; }
    if (e.form !== w + ' ' + prep) err(w + ' form != 母词+介词: ' + e.form);
    for (const s of e.m) {
      if (!s.startsWith('vp.')) { err(w + ' 词条混入非 vp 义: ' + s); continue; }
      const i = orig.indexOf(s);
      if (i < 0 || !vpIdx.has(i)) { err(w + ' vp 义不在原表: ' + s); continue; }
      if (vp[String(i)] !== prep) err(w + ' 义介词错组: ' + s + ' 应为 ' + vp[String(i)]);
      used.push(s);
    }
    if (!TIERS.has(e.tier)) err(w + ' tier 非法: ' + JSON.stringify(e.tier));
    const ch = e.chunks;
    if (!Array.isArray(ch) || ch.length < 1 || ch.length > 4) { err(w + ' 块数异常'); continue; }
    const join = [];
    for (const b of ch) {
      if (!Array.isArray(b) || b.length !== 2 || typeof b[0] !== 'string' || !b[0]) { err(w + ' 块形异常'); continue; }
      if (typeof b[1] !== 'string' || !ZH.test(b[1])) { err(w + ' 块义不合规: ' + JSON.stringify(b[1])); continue; }
      if (ch.length > 1 && !b[1]) { err(w + ' 多块词块义为空'); continue; }
      join.push(b[0]);
    }
    if (join.join('') !== e.form) err(w + ' 拼接不还原: ' + e.form + ' -> ' + join.join(''));
  }
  const usedSorted = used.slice().sort(), vpSorted = vpSenses.slice().sort();
  if (JSON.stringify(usedSorted) !== JSON.stringify(vpSorted)) err(w + ' vp 义并集 != 原全集');
}
if (errs) { console.log('RESULT FAIL errors=' + errs); process.exit(1); }
console.log('RESULT OK 母词=' + mothers + ' 新词条=' + entries);
