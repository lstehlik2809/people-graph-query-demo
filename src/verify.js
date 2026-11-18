const PG=require('./graph.js'); const {N,E}=PG; const D=PG.defaults;
const by=t=>E.filter(e=>e.type===t);
// 1 skill fit for default person vs MDA
const req=by('REQUIRES').filter(e=>e.s===D.role), hs=by('HAS_SKILL').filter(e=>e.s===D.person);
let num=0,den=0; for(const r of req){const h=hs.find(x=>x.t===r.t); num+=Math.min(h?h.level:0,r.level); den+=r.level;} console.log('fit',(num/den*100).toFixed(1));
// 2 talent >=70% excluding incumbents
const inc=new Set(by('HOLDS').filter(e=>e.t===D.role).map(e=>e.s)); let c=0;
for(const p of N.filter(n=>n.type==='Person')){ if(inc.has(p.id)) continue; let a=0; for(const r of req){ const h=by('HAS_SKILL').find(x=>x.s===p.id&&x.t===r.t); a+=Math.min(h?h.level:0,r.level);} if(a/den>=0.7) c++; } console.log('talent',c,'incumbents',inc.size);
// 3 ONA ties R&D-MS (team members only)
const teamDept=new Map(by('PART_OF').map(e=>[e.s,e.t])); const pd=new Map(by('MEMBER_OF').map(e=>[e.s,teamDept.get(e.t)]));
console.log('ties', by('COLLABORATES_WITH').filter(e=>{const a=pd.get(e.s),b=pd.get(e.t); return (a===D.deptA&&b===D.deptB)||(a===D.deptB&&b===D.deptA);}).length);
// 4 compliance open items
const today=Date.UTC(2026,10,18); let m=0,x=0,s=0;
for(const h of by('HOLDS')) for(const rc of by('REQUIRES_CERT').filter(e=>e.s===h.t)){ const ce=by('CERTIFIED').find(e=>e.s===h.s&&e.t===rc.t); if(!ce){m++;continue;} const ms=Date.parse(ce.expires+'T00:00:00Z'); if(ms<today)x++; else if(ms<today+30*864e5) s++; }
console.log('compliance',m+x+s,m,x,s);
