const fs=require('fs');const vm=require('vm');
const sb={window:{}};vm.createContext(sb);
vm.runInContext(fs.readFileSync('webapp/data/ielts.js','utf8'),sb);
const words=sb.window.IELTS_WORDS;
const POS_RE=/^(n|v|vt|vi|vp|adj|adv|prep|conj|pron|aux|int|art|num)\.\s+/;
let lens={},maxLen=0,maxEx=[],comma=0,commaEx=[],badPos=[],over10=0,senses=0,vpCnt=0;
for(const w of words){
  for(const s of w.m){
    senses++;
    const m=s.match(POS_RE);
    if(!m){badPos.push(w.w+' | '+s);continue;}
    const t=s.slice(m[0].length);
    lens[t.length]=(lens[t.length]||0)+1;
    if(t.length>maxLen){maxLen=t.length;maxEx=[w.w+' | '+s];}
    else if(t.length===maxLen&&maxEx.length<5)maxEx.push(w.w+' | '+s);
    if(t.length>10){over10++;if(over10<=5)console.log('over10:',w.w,'|',s);}
    if(t.includes('，')){comma++;if(comma<=8)commaEx.push(w.w+' | '+s);}
    if(m[1]==='vp')vpCnt++;
  }
}
console.log('total senses:',senses,'| vp senses:',vpCnt,'| badPos:',badPos.length,badPos.slice(0,5));
console.log('text length dist:',JSON.stringify(lens));
console.log('maxLen:',maxLen,maxEx);
console.log('senses with ，:',comma);console.log(commaEx.join('\n'));
console.log('senses text>10:',over10);
