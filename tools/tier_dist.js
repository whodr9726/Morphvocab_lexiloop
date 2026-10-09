const fs = require('fs'); const vm = require('vm');
const scores = {};
for (let n = 15; n <= 20; n++) { const nn = String(n).padStart(2, '0'); Object.assign(scores, JSON.parse(fs.readFileSync('tools/v2_out/rank_' + nn + '.json', 'utf8'))); }
const s = JSON.parse(fs.readFileSync('webapp/data/state.json', 'utf8'));
const prog = s.words.progress;
const dist = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, D: 0, 未打分: 0 };
for (const k of Object.keys(prog)) { const t = scores[k]; if (t) dist[t]++; else dist['未打分']++; }
const total = Object.keys(prog).length;
console.log('=== 已学池（' + total + ' 词）===');
for (const t of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D', '未打分']) if (dist[t]) console.log(t + ': ' + dist[t] + ' (' + Math.round(dist[t] / total * 100) + '%)');
const sb = { window: {} }; vm.createContext(sb);
vm.runInContext(fs.readFileSync('webapp/data/ielts.js', 'utf8'), sb);
const words = sb.window.IELTS_WORDS;
const un = words.slice(s.words.newCursor);
const us = {};
for (let n = 1; n <= 14; n++) { const nn = String(n).padStart(2, '0'); Object.assign(us, JSON.parse(fs.readFileSync('tools/v2_out/rank_' + nn + '.json', 'utf8'))); }
const udist = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, D: 0, 无: 0 };
for (const x of un) { const t = us[x.w]; if (t) udist[t]++; else udist['无']++; }
console.log('=== 未学池（' + un.length + ' 词）===');
for (const t of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D', '无']) if (udist[t]) console.log(t + ': ' + udist[t]);
console.log('学习序头部 12 词:', un.slice(0, 12).map(x => x.w + '(' + (us[x.w] || '新vp') + ')').join(' '));
console.log('A1 剩余:', un.filter(x => us[x.w] === 'A1').length, '| A1+A2 剩余:', un.filter(x => us[x.w] === 'A1' || us[x.w] === 'A2').length);
