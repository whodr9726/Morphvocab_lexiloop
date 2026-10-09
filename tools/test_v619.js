const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync('app.js', 'utf8');
function extract(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('fn not found: ' + name);
  let d = 0; const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
}
const sb = { window: {}, console };
vm.createContext(sb);
vm.runInContext(fs.readFileSync('data/chunk_map.js', 'utf8'), sb);
vm.runInContext('var CHUNK_MAP_REAL = window.CHUNK_MAP;', sb);
vm.runInContext('function enForm(e){return e.w==="abide"?"abide by":e.w;} function esc(s){return String(s);}', sb);
vm.runInContext(extract('splitWordChunks'), sb);
vm.runInContext(extract('fbWordHtml'), sb);
let fails = 0;
function t(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); if (!cond) fails++; }
t('1 拆块取块文本 unprecedented', vm.runInContext("JSON.stringify(splitWordChunks('unprecedented'))", sb) === JSON.stringify(['un', 'precedent', 'ed']));
t('2 单块词 carp', vm.runInContext("JSON.stringify(splitWordChunks('carp'))", sb) === '["carp"]');
sb.window.CHUNK_MAP = { oldfmt: ['aa', 'bb'] };
t('3 旧字符串格式兼容', vm.runInContext("JSON.stringify(splitWordChunks('oldfmt'))", sb) === '["aa","bb"]');
t('4 ≤3字母回落整词', vm.runInContext("JSON.stringify(splitWordChunks('nut'))", sb) === '["nut"]');
const r5 = vm.runInContext("splitWordChunks('stopped')", sb);
t('5 缺表词机械切还原', r5.length >= 2 && r5.length <= 4 && r5.join('') === 'stopped');
sb.window.CHUNK_MAP = sb.CHUNK_MAP_REAL;
const h1 = vm.runInContext("fbWordHtml({w:'unprecedented'})", sb);
t('6 分解显示含块与块义', h1.includes('fb-chunks') && h1.includes('否定') && h1.includes('precedent') && h1.includes('先例') && h1.includes('过去式'));
t('7 单块词回落大字', vm.runInContext("fbWordHtml({w:'carp'})", sb) === '<div class="fb-correct-word">carp</div>');
t('8 vp词整体不分解', vm.runInContext("fbWordHtml({w:'abide'})", sb) === '<div class="fb-correct-word">abide by</div>');
t('9 未命中回落大字', vm.runInContext("fbWordHtml({w:'zzzzzz'})", sb) === '<div class="fb-correct-word">zzzzzz</div>');
console.log(fails === 0 ? 'ALL 9 PASS' : fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
