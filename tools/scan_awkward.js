const fs=require('fs');const vm=require('vm');
const sb={window:{}};vm.createContext(sb);
vm.runInContext(fs.readFileSync('webapp/data/ielts.js','utf8'),sb);
const words=sb.window.IELTS_WORDS;
console.log('total:',words.length);
for(const w of words) if(w.w==='greatly') console.log('greatly =',JSON.stringify(w.m));
// 释义正文 <=2 字
let short=[];
for(const w of words) for(const s of w.m){
  const m=s.match(/^([a-z.]+)\s+(.+)$/);
  if(m && m[2].length<=2) short.push(w.w+' | '+s);
}
console.log('--- senses text<=2 chars:',short.length);
console.log(short.slice(0,80).join('\n'));
// 文言桩模式
const pats=/大为|颇为|甚为|尤为|深感|倍加|堪称|诚为|极为/;
let lit=[];
for(const w of words) for(const s of w.m){ if(pats.test(s)) lit.push(w.w+' | '+s); }
console.log('--- literary stub hits:',lit.length);
console.log(lit.slice(0,50).join('\n'));
