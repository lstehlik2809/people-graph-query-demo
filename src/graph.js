// People graph: synthetic data generator + in-memory graph + query engine.
// Everything is deterministic (seeded), so every viewer sees the same company.
const PG = (function () {
'use strict';

// ---------- seeded randomness ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mulberry32(20261118);
const pick = a => a[Math.floor(rnd()*a.length)];
const ri = (a,b) => a + Math.floor(rnd()*(b-a+1));
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
function wpick(obj){ let tot=0; for(const k in obj) tot+=obj[k]; let r=rnd()*tot; for(const k in obj){ r-=obj[k]; if(r<=0) return k; } return Object.keys(obj)[0]; }
function sample(arr,k){ const a=arr.slice(); const outp=[]; while(a.length && outp.length<k){ outp.push(a.splice(Math.floor(rnd()*a.length),1)[0]); } return outp; }

const TODAY = Date.UTC(2026,10,18), DAY = 86400000;
const iso = ms => new Date(ms).toISOString().slice(0,10);

// ---------- colours shared with the renderer ----------
// Type colours (what a node is) and status colours (how it scores) never share a hue.
const C = { person:'#7fb2ff', role:'#c4a3ff', skill:'#56c7e0', course:'#f2a7d8', cert:'#efe6cf', team:'#8b95a8', dept:'#8b95a8',
  ok:'#4ade80', warn:'#fbbf24', bad:'#f87171', muted:'#6d7a91', link:'#8fa3c4', focus:'#ffffff', deptA:'#7fb2ff', deptB:'#ff9f5a' };
const TYPE_COLOR = { Person:C.person, Role:C.role, Skill:C.skill, Course:C.course, Certification:C.cert, Team:C.team, Department:C.dept };

// ---------- graph store ----------
const N=[], E=[], outE=[], inE=[];
function addNode(type,name,props){ const n=Object.assign({id:N.length,type,name},props||{}); N.push(n); outE.push([]); inE.push([]); return n; }
function addEdge(s,t,type,props){ const e=Object.assign({id:E.length,s,t,type},props||{}); E.push(e); outE[s].push(e.id); inE[t].push(e.id); return e; }

// tracing: every relationship the query engine touches is counted
let TR=null;
function out(id,type){ const r=[]; for(const i of outE[id]){ const e=E[i]; if(!type||e.type===type) r.push(e); } if(TR){ TR.edges+=r.length; TR.nodes.add(id); for(const e of r) TR.nodes.add(e.t); } return r; }
function inn(id,type){ const r=[]; for(const i of inE[id]){ const e=E[i]; if(!type||e.type===type) r.push(e); } if(TR){ TR.edges+=r.length; TR.nodes.add(id); for(const e of r) TR.nodes.add(e.s); } return r; }
function both(id,type){ return out(id,type).map(e=>({e,o:e.t})).concat(inn(id,type).map(e=>({e,o:e.s}))); }
// silent (untraced) helpers for setup
const sOut=(id,type)=>outE[id].map(i=>E[i]).filter(e=>!type||e.type===type);
const sIn=(id,type)=>inE[id].map(i=>E[i]).filter(e=>!type||e.type===type);

// ---------- reference data ----------
const SKILL_CATS = {
  'Engineering':['Software Engineering','System Design','Cloud Architecture','Testing & QA','DevOps','Product Discovery','UX Research','Security Engineering'],
  'Customer':['Customer Onboarding','Account Health Analysis','Technical Support','Product Training','Customer Advocacy'],
  'Commercial':['Account Planning','Negotiation','Pricing','Brand Strategy','Customer Insights','CRM Analytics','Market Research'],
  'Finance':['Financial Modelling','Budgeting','Business Partnering','Forecasting'],
  'People':['People Leadership','Coaching','Talent Acquisition','Workforce Planning','People Analytics','Employee Relations'],
  'Data & IT':['Python','SQL','Machine Learning','Cloud Data Engineering','Data Visualization','Generative AI','MLOps','Agile Delivery'],
  'Risk & Compliance':['Risk Assessment','Internal Audit','Incident Management','Data Protection','Process Controls'],
  'Operations':['Health & Safety','Equipment Operation','Quality Inspection','Process Improvement','Logistics Planning','Inventory Management','Lean Six Sigma','Supply Planning'],
  'Transversal':['Stakeholder Management','Project Management','Change Management','Strategic Thinking','Data Literacy','Problem Solving'],
};
// emerging / niche skills are rarer at expert level
const SCARCE = {'Generative AI':-1.3,'MLOps':-0.9,'Security Engineering':-1.0,'Pricing':-0.6,'Cloud Architecture':-0.7,'Workforce Planning':-0.7,'Customer Advocacy':-0.5,'Logistics Planning':-0.4};

const DEPTS = [
  {key:'ENG', name:'Product & Engineering', hc:210, cat:'Engineering', locs:['Amsterdam','Dublin','Toronto']},
  {key:'CS',name:'Customer Success', hc:60, cat:'Customer', locs:['Dublin','Lisbon','Warsaw']},
  {key:'SM',name:'Sales & Marketing', hc:170, cat:'Commercial', locs:['Amsterdam','Madrid','Milan','Warsaw','Manchester']},
  {key:'FIN',name:'Finance', hc:50, cat:'Finance', locs:['Amsterdam','Lisbon']},
  {key:'HR', name:'People & Culture', hc:45, cat:'People', locs:['Amsterdam','Warsaw','Lisbon']},
  {key:'DIT',name:'Data & IT', hc:85, cat:'Data & IT', locs:['Lisbon','Warsaw','Dublin','Amsterdam']},
  {key:'RC', name:'Risk & Compliance', hc:80, cat:'Risk & Compliance', locs:['Amsterdam','Dublin']},
  {key:'OPS', name:'Operations', hc:299, cat:'Operations', locs:['Rotterdam','Manchester','Poznan']},
];
const deptByKey = {}; DEPTS.forEach(d=>deptByKey[d.key]=d);
deptByKey.EXEC = {key:'EXEC', name:'Executive Office', locs:['Amsterdam']};

const ROLE_DEFS = [
 ['JSE','Junior Software Engineer','ENG',1,['Software Engineering','Testing & QA','DevOps','Data Literacy','Problem Solving']],
 ['SWE','Software Engineer','ENG',2,['Software Engineering','System Design','Testing & QA','DevOps','Data Literacy','Project Management']],
 ['SSE','Senior Software Engineer','ENG',3,['System Design','Software Engineering','Cloud Architecture','Security Engineering','Project Management','Stakeholder Management']],
 ['PRIN','Principal Engineer','ENG',4,['Cloud Architecture','System Design','Product Discovery','Strategic Thinking','Stakeholder Management','Security Engineering']],
 ['QAE','QA Automation Engineer','ENG',3,['Testing & QA','Software Engineering','Python','Data Literacy','DevOps']],
 ['DSGN','Product Designer','ENG',3,['UX Research','Product Discovery','Customer Insights','Data Visualization','Stakeholder Management']],
 ['PM','Product Manager','ENG',4,['Product Discovery','Project Management','Stakeholder Management','UX Research','People Leadership']],
 ['EM','Engineering Manager','ENG',4,['People Leadership','Software Engineering','Project Management','System Design','Coaching']],
 ['HEAD_ENG','Head of Product & Engineering','ENG',5,['Strategic Thinking','People Leadership','Cloud Architecture','Stakeholder Management','Change Management']],
 ['CSM','Customer Success Manager','CS',2,['Customer Onboarding','Account Health Analysis','Product Training','Customer Insights','Stakeholder Management']],
 ['SCSM','Senior Customer Success Manager','CS',3,['Account Health Analysis','Customer Advocacy','Customer Onboarding','Negotiation','Stakeholder Management']],
 ['SUPP','Support Specialist','CS',2,['Technical Support','Product Training','Incident Management','Data Protection','Data Literacy']],
 ['CSLEAD','Customer Success Lead','CS',4,['People Leadership','Customer Advocacy','Account Health Analysis','Coaching','Strategic Thinking']],
 ['HEAD_CS','Head of Customer Success','CS',5,['Strategic Thinking','People Leadership','Customer Advocacy','Stakeholder Management','Change Management']],
 ['SDR','Sales Development Representative','SM',1,['Account Planning','Negotiation','Customer Insights','Product Training','Problem Solving']],
 ['AE','Account Executive','SM',3,['Account Planning','Negotiation','Stakeholder Management','Pricing','Customer Insights']],
 ['MKT','Marketing Manager','SM',3,['Brand Strategy','Customer Insights','Project Management','Data Literacy','Budgeting']],
 ['PRC','Pricing Manager','SM',3,['Pricing','Market Research','Financial Modelling','Negotiation','Stakeholder Management']],
 ['SALOPS','Sales Operations Analyst','SM',2,['CRM Analytics','SQL','Data Visualization','Customer Insights','Forecasting']],
 ['COMLEAD','Sales & Marketing Team Lead','SM',4,['People Leadership','Coaching','Account Planning','Negotiation','Forecasting']],
 ['HEAD_SM','Head of Sales & Marketing','SM',5,['Strategic Thinking','People Leadership','Brand Strategy','Stakeholder Management','Change Management']],
 ['FA','Financial Analyst','FIN',2,['Financial Modelling','Forecasting','Budgeting','SQL','Data Literacy']],
 ['CTRL','Business Controller','FIN',3,['Business Partnering','Budgeting','Financial Modelling','Stakeholder Management','Forecasting']],
 ['FPA','FP&A Manager','FIN',4,['Forecasting','Financial Modelling','People Leadership','Business Partnering','Strategic Thinking']],
 ['HEAD_FIN','Chief Financial Officer','FIN',5,['Strategic Thinking','People Leadership','Financial Modelling','Stakeholder Management','Change Management']],
 ['HRBP','HR Business Partner','HR',3,['Employee Relations','Coaching','Change Management','Stakeholder Management','Workforce Planning']],
 ['TA','Talent Acquisition Specialist','HR',2,['Talent Acquisition','Stakeholder Management','Negotiation','Data Literacy','Problem Solving']],
 ['PA','People Analyst','HR',3,['People Analytics','SQL','Python','Data Visualization','Workforce Planning','Stakeholder Management']],
 ['HRLEAD','HR Team Lead','HR',4,['People Leadership','Coaching','Employee Relations','Change Management','Workforce Planning']],
 ['HEAD_HR','Head of People & Culture','HR',5,['Strategic Thinking','People Leadership','Workforce Planning','Stakeholder Management','Change Management']],
 ['DE','Data Engineer','DIT',2,['SQL','Cloud Data Engineering','Python','Agile Delivery','Data Literacy']],
 ['DS','Data Scientist','DIT',3,['Python','Machine Learning','SQL','Data Visualization','Problem Solving','Stakeholder Management']],
 ['ML','ML Engineer','DIT',3,['MLOps','Python','Machine Learning','Cloud Data Engineering','Generative AI']],
 ['ODA','Operations Data Analyst','DIT',2,['SQL','Data Visualization','Python','Inventory Management','Lean Six Sigma']],
 ['PO','Product Owner','DIT',3,['Agile Delivery','Stakeholder Management','Project Management','Data Literacy','Change Management']],
 ['DIGLEAD','Data & IT Team Lead','DIT',4,['People Leadership','Agile Delivery','Cloud Data Engineering','Coaching','Strategic Thinking']],
 ['HEAD_DIT','Head of Data & IT','DIT',5,['Strategic Thinking','People Leadership','Cloud Data Engineering','Stakeholder Management','Change Management']],
 ['COMPA','Compliance Analyst','RC',1,['Process Controls','Data Protection','Risk Assessment','Internal Audit','Problem Solving']],
 ['RISK','Risk Analyst','RC',2,['Risk Assessment','Incident Management','Process Controls','Data Protection','Internal Audit']],
 ['AUD','Internal Auditor','RC',3,['Internal Audit','Process Controls','Risk Assessment','Data Protection','Project Management']],
 ['COMPM','Compliance Manager','RC',4,['Risk Assessment','Internal Audit','People Leadership','Data Protection','Incident Management']],
 ['HEAD_RC','Head of Risk & Compliance','RC',5,['Strategic Thinking','People Leadership','Risk Assessment','Stakeholder Management','Change Management']],
 ['OPA','Operations Associate','OPS',1,['Health & Safety','Equipment Operation','Quality Inspection','Problem Solving']],
 ['OPT','Operations Technician','OPS',2,['Health & Safety','Equipment Operation','Quality Inspection','Inventory Management','Lean Six Sigma']],
 ['PE','Process Engineer','OPS',3,['Process Improvement','Logistics Planning','Health & Safety','Lean Six Sigma','Data Literacy','Python']],
 ['SCP','Supply Chain Planner','OPS',2,['Supply Planning','Forecasting','SQL','Stakeholder Management','Inventory Management']],
 ['OPSUP','Operations Supervisor','OPS',4,['People Leadership','Health & Safety','Lean Six Sigma','Process Improvement','Coaching']],
 ['HEAD_OPS','Head of Operations','OPS',5,['Strategic Thinking','People Leadership','Supply Planning','Stakeholder Management','Change Management']],
 ['CEO','Chief Executive Officer','EXEC',5,['Strategic Thinking','People Leadership','Stakeholder Management','Change Management','Financial Modelling']],
];
const CORE=[0,2,3,4,4,4], OTHER=[0,1,2,3,3,4];

const NEXT = {JSE:['SWE'],SWE:['SSE','QAE','PO'],SSE:['PRIN','EM','PM','DE'],PRIN:['EM','HEAD_ENG','PM'],QAE:['SWE','DE'],DSGN:['PM','MKT'],PM:['HEAD_ENG'],EM:['HEAD_ENG'],
 CSM:['SCSM','AE','CSLEAD'],SCSM:['CSLEAD','AE'],SUPP:['CSM','RISK'],CSLEAD:['HEAD_CS'],
 SDR:['AE','SALOPS','CSM'],AE:['COMLEAD','PRC','MKT'],MKT:['COMLEAD','HEAD_SM'],PRC:['MKT','COMLEAD','CTRL'],SALOPS:['DS','MKT','FA'],COMLEAD:['HEAD_SM'],
 FA:['CTRL','SALOPS','PA'],CTRL:['FPA'],FPA:['HEAD_FIN'],
 TA:['HRBP'],HRBP:['HRLEAD'],PA:['DS','HRBP'],HRLEAD:['HEAD_HR'],
 DE:['DS','ML','PO'],DS:['ML','PO','DIGLEAD'],ML:['DIGLEAD'],ODA:['DE','PE','DS'],PO:['DIGLEAD','PM'],DIGLEAD:['HEAD_DIT'],
 COMPA:['RISK','AUD'],RISK:['AUD','COMPM','CTRL'],AUD:['COMPM','CTRL'],COMPM:['HEAD_RC'],
 OPA:['OPT'],OPT:['PE','OPSUP','COMPA','ODA'],PE:['OPSUP','RISK','ODA','SCP'],SCP:['FA','OPSUP'],OPSUP:['HEAD_OPS'],
 HEAD_ENG:['CEO'],HEAD_SM:['CEO'],HEAD_FIN:['CEO']};
const PREV = {}; for(const a in NEXT) for(const b of NEXT[a]) (PREV[b]=PREV[b]||[]).push(a);

const ENG = {JSE:4,SWE:4,SSE:2,PRIN:1};
const TEAMS = {
 ENG:[{n:'Platform',lead:'EM',mix:ENG},{n:'Payments',lead:'EM',mix:ENG},{n:'QA Automation',lead:'EM',mix:{QAE:6,SWE:1}},{n:'Mobile Apps',lead:'EM',mix:ENG},{n:'Product Design',lead:'EM',mix:{DSGN:5,SWE:1}},{n:'Product Management',lead:'PM',mix:{DSGN:2,SWE:2,JSE:1}},{n:'Core Services',lead:'EM',mix:ENG}],
 CS:[{n:'Enterprise Customers',lead:'CSLEAD',mix:{CSM:4,SCSM:2}},{n:'Support Desk',lead:'CSLEAD',mix:{SUPP:6,SCSM:1}},{n:'Mid-Market Customers',lead:'CSLEAD',mix:{CSM:4,SCSM:2}}],
 SM:[{n:'Field Sales North',lead:'COMLEAD',mix:{SDR:6,AE:2}},{n:'Key Accounts',lead:'COMLEAD',mix:{AE:5,SDR:1}},{n:'Field Sales South',lead:'COMLEAD',mix:{SDR:6,AE:2}},{n:'Marketing',lead:'COMLEAD',mix:{MKT:4,SALOPS:1}},{n:'Pricing',lead:'COMLEAD',mix:{PRC:4,MKT:1}},{n:'Field Sales Central',lead:'COMLEAD',mix:{SDR:6,AE:2}},{n:'Sales Operations',lead:'COMLEAD',mix:{SALOPS:5}}],
 FIN:[{n:'FP&A',lead:'FPA',mix:{FA:4,CTRL:1}},{n:'Business Controlling',lead:'FPA',mix:{CTRL:4,FA:2}},{n:'Accounting',lead:'FPA',mix:{FA:5}}],
 HR:[{n:'HR Business Partnering',lead:'HRLEAD',mix:{HRBP:5}},{n:'Talent Acquisition',lead:'HRLEAD',mix:{TA:5}},{n:'People Analytics',lead:'HRLEAD',mix:{PA:4}}],
 DIT:[{n:'Data Platform',lead:'DIGLEAD',mix:{DE:5,PO:1}},{n:'Data Science',lead:'DIGLEAD',mix:{DS:5,ML:1}},{n:'Operations Analytics',lead:'DIGLEAD',mix:{ODA:4,DE:1}},{n:'AI & ML Engineering',lead:'DIGLEAD',mix:{ML:4,DS:1,DE:1}},{n:'Digital Products',lead:'DIGLEAD',mix:{PO:3,DE:2,DS:1}}],
 RC:[{n:'Compliance Office',lead:'COMPM',mix:{COMPA:6,RISK:1}},{n:'Risk Management',lead:'COMPM',mix:{RISK:5,COMPA:1}},{n:'Internal Audit',lead:'COMPM',mix:{AUD:5}}],
 OPS:[{n:'Fulfilment Centre',lead:'OPSUP',mix:{OPA:6,OPT:3}},{n:'Inbound Logistics',lead:'OPSUP',mix:{OPA:4,OPT:3,PE:1}},{n:'Outbound Logistics',lead:'OPSUP',mix:{OPA:4,OPT:3,PE:1}},{n:'Process Engineering',lead:'OPSUP',mix:{PE:5,OPT:1}},{n:'Packing & Dispatch',lead:'OPSUP',mix:{OPA:7,OPT:2}},{n:'Supply Planning',lead:'OPSUP',mix:{SCP:5}},{n:'Maintenance',lead:'OPSUP',mix:{OPT:5,PE:1}}],
};

const CERTS = [
 ['HS','Health & Safety Certification (annual)',['OPA','OPT','PE','OPSUP','HEAD_OPS']],
 ['EQUIP','Equipment Operator Licence',['OPA','OPT']],
 ['DP','Data Protection Certification',['SUPP','COMPA','RISK','AUD','COMPM','HRBP','PA']],
];
const CERT_SHORT = {HS:'Health & Safety', EQUIP:'Equipment licence', DP:'Data protection'};

const COURSE_FOUND = ['Python','SQL','Machine Learning','MLOps','Cloud Data Engineering','Data Visualization','Generative AI','Software Engineering','Cloud Architecture','Security Engineering','Testing & QA','Product Discovery','UX Research','Health & Safety','Equipment Operation','Process Improvement','Lean Six Sigma','Logistics Planning','Risk Assessment','Incident Management','Data Protection','People Leadership','Coaching','Stakeholder Management','Project Management','Change Management','Financial Modelling','Pricing','Negotiation','People Analytics','Workforce Planning','Strategic Thinking','Data Literacy'];
const COURSE_ADV = ['Python','SQL','Machine Learning','MLOps','Cloud Data Engineering','Generative AI','Software Engineering','Cloud Architecture','Security Engineering','Process Improvement','Lean Six Sigma','People Leadership','Project Management','Financial Modelling','People Analytics','Data Visualization'];
const COURSE_NAMES = {'Lean Six Sigma':['Lean Six Sigma Yellow Belt','Lean Six Sigma Green Belt'],'People Leadership':['First-Time Manager Programme','Leading Leaders Programme'],'Health & Safety':['Health & Safety Essentials','Advanced Health & Safety']};
const CROSS_PREREQ = [['Machine Learning','Python'],['MLOps','Machine Learning'],['MLOps','Cloud Data Engineering'],['Generative AI','Python'],['Process Improvement','Lean Six Sigma'],['Equipment Operation','Health & Safety'],['People Analytics','SQL'],['Security Engineering','Software Engineering'],['Cloud Architecture','Software Engineering']];
const PROVIDERS = ['Internal academy','External e-learning','University partner','Vendor training'];

const FIRST =
['Anna','Lukas','Marie','Jakub','Sofia','Thomas','Camille','Elena','Mateo','Julia','Pierre','Klara','David','Lea','Marco','Petra','Hugo','Nina','Tomas','Ines','Felix','Zofia','Omar','Laura','Martin','Chloe','Adam','Eva','Luca','Sara','Daniel','Amelie','Pavel','Isabel','Jonas','Mia','Andrei','Noemi','Samuel','Hana','Victor','Alice','Karim','Lucia','Ben','Emma','Oskar','Leila','Matej','Clara','Nikolai','Giulia','Erik','Aisha','Viktor','Rosa','Henrik','Maya','Filip','Yusuf','Priya','Dario','Sven','Ana','Rafael','Lina','Jan','Ewa','Teodor','Manon'];
const LAST = ['Novak','Dubois','Schmidt','Rossi','Garcia','Kowalski','Horvath','Martin','Bernard','Muller','Fischer','Weber','Moreau','Laurent','Lefevre','Ricci','Romano','Lopez','Fernandez','Svoboda','Dvorak','Nagy','Toth','Szabo','Wagner','Becker','Hoffmann','Petit','Durand','Leroy','Conti','Greco','Sanchez','Torres','Nowak','Wisniewski','Cerny','Prochazka','Kovacs','Varga','Peeters','Janssens','Maes','Jacobs','Mertens','Smith','Johnson','Brown','Lee','Walker','Hall','Young','Allen','King','Wright','Scott','Green','Baker','Adams','Nelson','Carter','Mitchell','Roberts','Turner','Phillips','Campbell','Parker','Evans','Edwards','Collins','Stewart','Morris','Murphy','Cook','Rogers','Morgan','Bell','Ward','Cooper','Haddad','Rahman','Ivanova','Petrov','Silva','Costa'];

// ---------- build nodes ----------
const deptNode = {};
for(const d of DEPTS){ deptNode[d.key] = addNode('Department', d.name, {key:d.key}).id; }
const skillId = {}; const TRANS = SKILL_CATS.Transversal;
for(const cat in SKILL_CATS) for(const s of SKILL_CATS[cat]) skillId[s] = addNode('Skill', s, {cat}).id;
const roleId = {};
for(const [k,title,dept,sen,sk] of ROLE_DEFS){
  const r = addNode('Role', title, {key:k, dept, sen});
  roleId[k] = r.id;
  sk.forEach((s,i)=>{ let lvl = i<3 ? CORE[sen] : OTHER[sen]; if(sen===5 && i===0) lvl=5; addEdge(r.id, skillId[s], 'REQUIRES', {level:lvl, core:i<3}); });
}
// courses
const courseFor = {}; // skill -> [foundation, advanced]
for(const s of COURSE_FOUND){
  const names = COURSE_NAMES[s] || [s+' Foundations','Advanced '+s];
  const f = addNode('Course', names[0], {hours:ri(4,12), provider:pick(PROVIDERS), upTo:2, skill:skillId[s]});
  addEdge(f.id, skillId[s], 'TEACHES', {upTo:2});
  courseFor[s] = [f.id];
  if(COURSE_ADV.includes(s)){
    const a = addNode('Course', names[1], {hours:ri(14,32), provider:pick(PROVIDERS), upTo:4, skill:skillId[s], adv:true});
    addEdge(a.id, skillId[s], 'TEACHES', {upTo:4});
    addEdge(a.id, f.id, 'REQUIRES_COURSE');
    courseFor[s].push(a.id);
  }
}
for(const [a,b] of CROSS_PREREQ){ addEdge(courseFor[a][0], courseFor[b][0], 'REQUIRES_COURSE'); }
// certifications
const certId = {};
for(const [k,name,roles] of CERTS){ const c = addNode('Certification', name, {key:k}); certId[k]=c.id; for(const rk of roles) addEdge(roleId[rk], c.id, 'REQUIRES_CERT'); }

// ---------- people & org ----------
const usedNames = new Set();
function newName(){ for(let i=0;i<80;i++){ const n=pick(FIRST)+' '+pick(LAST); if(!usedNames.has(n)){ usedNames.add(n); return n; } } let n; do{ n=pick(FIRST)+' '+String.fromCharCode(65+ri(0,25))+'. '+pick(LAST);}while(usedNames.has(n)); usedNames.add(n); return n; }
const TENURE = [null,[0,4],[1,8],[3,14],[5,20],[8,25]];
const people = [];
function mkPerson(dept, teamId, rk, mgr, loc){
  const r = N[roleId[rk]];
  const p = addNode('Person', newName(), {dept, role:r.id, team:teamId, mgr, loc, tenure:ri(...TENURE[r.sen]), perf:Number(wpick({2:1,3:5,4:3,5:1}))});
  addEdge(p.id, r.id, 'HOLDS', {since: 2026 - ri(0, Math.min(p.tenure, 6))});
  if(teamId!=null) addEdge(p.id, teamId, 'MEMBER_OF');
  if(mgr!=null) addEdge(p.id, mgr, 'REPORTS_TO');
  people.push(p); return p;
}
const ceo = mkPerson('EXEC', null, 'CEO', null, 'Amsterdam');
const heads = {}; const teamsByDept = {};
for(const d of DEPTS){
  const head = mkPerson(d.key, null, 'HEAD_'+d.key, ceo.id, d.locs[0]);
  heads[d.key] = head.id;
  addEdge(head.id, deptNode[d.key], 'HEADS');
  const nT = Math.round((d.hc-1)/11.5);
  const members = d.hc - 1 - nT;
  const sizes = new Array(nT).fill(Math.floor(members/nT));
  { const rem = members - sizes.reduce((a,b)=>a+b,0); for(let i=0;i<rem;i++) sizes[i%nT]++; }
  for(let i=0;i<nT*2;i++){ const a=ri(0,nT-1), b=ri(0,nT-1), m=ri(0,3); if(sizes[a]-m>=6){ sizes[a]-=m; sizes[b]+=m; } }
  const tpls = TEAMS[d.key]; const seen = {};
  teamsByDept[d.key] = [];
  for(let t=0;t<nT;t++){
    const tpl = tpls[t % tpls.length];
    const loc = d.locs[(t + Math.floor(t/tpls.length)) % d.locs.length];
    let name = tpl.n + ' · ' + loc; seen[name] = (seen[name]||0)+1; if(seen[name]>1) name += ' ' + ['','','II','III','IV','V','VI'][seen[name]];
    const team = addNode('Team', name, {dept:d.key, loc});
    addEdge(team.id, deptNode[d.key], 'PART_OF');
    teamsByDept[d.key].push(team.id);
    const lead = mkPerson(d.key, team.id, tpl.lead, head.id, loc);
    team.lead = lead.id;
    for(let i=0;i<sizes[t];i++) mkPerson(d.key, team.id, wpick(tpl.mix), lead.id, loc);
  }
}

// ---------- careers, skills, learning, certificates ----------
const NOISE = {'-2':1,'-1':3,'0':5,'1':2};
const SOURCES = {'Inferred · LMS':3,'Inferred · performance review':2,'Inferred · work systems':2,'Self-declared (career profile)':3};
const reqOf = rid => sOut(rid,'REQUIRES');
const moveCount = {};
for(const p of people){
  // career history (previous roles), oldest first
  const hist = [];
  const curKey = N[p.role].key;
  if(p.tenure>=3 && PREV[curKey] && rnd()<0.75){
    const h1 = pick(PREV[curKey]); hist.unshift(h1);
    if(p.tenure>=8 && PREV[h1] && rnd()<0.5) hist.unshift(pick(PREV[h1]));
  }
  p.history = hist.map(k=>roleId[k]);
  p.history.forEach((rid,i)=>addEdge(p.id, rid, 'HELD', {until: 2026 - ri(1, 3) - (p.history.length-1-i)*ri(2,4)}));
  const seq = p.history.concat([p.role]);
  for(let i=0;i<seq.length-1;i++){ const k=seq[i]+'>'+seq[i+1]; moveCount[k]=(moveCount[k]||0)+1; }

  // skills
  const sk = {};
  const add = (sid,l)=>{ l=clamp(Math.round(l),0,5); if(l<=0) return; if(sk[sid]===undefined || sk[sid]<l) sk[sid]=l; };
  const bonus = (p.tenure>10?0.3:0) + (p.perf>=4?0.3:0);
  for(const e of reqOf(p.role)) add(e.t, e.level + Number(wpick(NOISE)) + bonus + (SCARCE[N[e.t].name]||0));
  for(const h of p.history) for(const e of reqOf(h)) add(e.t, e.level - 1 + Number(wpick(NOISE)) + (SCARCE[N[e.t].name]||0));
  for(const s of sample(TRANS,2)) add(skillId[s], ri(1,3));
  const cat = (deptByKey[p.dept].cat) || 'Transversal';
  add(skillId[pick(SKILL_CATS[cat])], ri(1,3));
  if(p.dept!=='DIT' && rnd()<0.06){ add(skillId.Python, ri(2,4)); add(skillId.SQL, ri(2,4)); add(skillId['Data Visualization'], ri(1,3)); if(rnd()<0.35) add(skillId['Machine Learning'], ri(2,3)); }
  if(rnd()<0.07) add(skillId['Generative AI'], ri(1,2));
  if(N[p.role].sen>=4){ for(const s of ['Strategic Thinking','Stakeholder Management','Change Management']) if(rnd()<0.75) add(skillId[s], ri(2,4) + (p.perf>=4?0.4:0)); }
  for(const sid in sk){
    const validated = rnd()<0.35;
    const source = validated ? 'Manager-validated' : wpick(SOURCES);
    const conf = validated ? 0.9 + rnd()*0.08 : 0.5 + rnd()*0.35;
    addEdge(p.id, Number(sid), 'HAS_SKILL', {level:sk[sid], source, confidence:Math.round(conf*100)/100});
  }
  p.sk = sk;
  // learning history (LMS)
  for(const sid in sk){
    const cs = courseFor[N[sid].name]; if(!cs) continue;
    if(sk[sid]>=2 && rnd()<0.45) addEdge(p.id, cs[0], 'COMPLETED', {year:ri(2019,2026)});
    if(cs[1] && sk[sid]>=4 && rnd()<0.5) addEdge(p.id, cs[1], 'COMPLETED', {year:ri(2021,2026)});
  }
  // certifications
  for(const e of sOut(p.role,'REQUIRES_CERT')){
    const r = rnd(); let exp = null;
    if(r<0.80) exp = TODAY + ri(31,365)*DAY; else if(r<0.87) exp = TODAY + ri(0,30)*DAY; else if(r<0.95) exp = TODAY - ri(1,240)*DAY;
    if(exp!==null) addEdge(p.id, e.t, 'CERTIFIED', {expires: iso(exp)});
  }
}
for(const k in moveCount){ const [a,b]=k.split('>').map(Number); addEdge(a, b, 'MOVED_TO', {moves:moveCount[k]}); }

// ---------- collaboration network (ONA) ----------
const AFF = {ENG:{OPS:3,CS:3,RC:2,DIT:2,FIN:1,HR:1,SM:1}, CS:{ENG:3,SM:3,RC:1,DIT:1,HR:1,FIN:1}, SM:{CS:3,FIN:2,DIT:2,OPS:1,HR:1,ENG:1},
  FIN:{SM:2,OPS:2,ENG:1,HR:1,DIT:1,RC:1,CS:1}, HR:{ENG:1,CS:1,SM:1,FIN:1,DIT:1,RC:1,OPS:1}, DIT:{OPS:2,ENG:2,SM:2,FIN:1,HR:1,RC:1},
  RC:{OPS:4,ENG:2,DIT:1,CS:1}, OPS:{RC:4,ENG:2,DIT:2,FIN:1,SM:1,HR:1}};
const BRIDGE = {PE:['ENG','RC','DIT'], ODA:['OPS','RC'], AUD:['OPS','ENG'], PM:['CS','DIT'], CSM:['SM','ENG'], SCSM:['ENG','SM'], CTRL:['SM','OPS','ENG'], HRBP:['ENG','OPS','SM','DIT'], PO:['OPS','SM','ENG'], SCP:['SM','FIN'], QAE:['DIT','CS'], OPSUP:['RC','ENG']};
const membersOfTeam = {}; const peopleByDept = {};
for(const p of people){ if(p.team!=null) (membersOfTeam[p.team]=membersOfTeam[p.team]||[]).push(p.id); if(p.team!=null) (peopleByDept[p.dept]=peopleByDept[p.dept]||[]).push(p.id); }
const collabSeen = new Set();
function collab(a,b){ if(a===b) return; const k=a<b?a+'-'+b:b+'-'+a; if(collabSeen.has(k)) return; collabSeen.add(k); addEdge(a,b,'COLLABORATES_WITH',{perMonth:ri(2,30)}); }
for(const p of people){
  if(p.team==null) continue;
  const mates = membersOfTeam[p.team].filter(x=>x!==p.id);
  for(const m of sample(mates, ri(2,4))) collab(p.id, m);
  if(p.mgr!=null && rnd()<0.9) collab(p.id, p.mgr);
  const sameDept = peopleByDept[p.dept];
  for(let i=0;i<ri(0,2);i++) collab(p.id, pick(sameDept));
  if(rnd()<0.2){ const d = wpick(AFF[p.dept]); collab(p.id, pick(peopleByDept[d])); }
  const br = BRIDGE[N[p.role].key];
  if(br && rnd()<0.4){ const k=ri(3,8); for(let i=0;i<k;i++) collab(p.id, pick(peopleByDept[pick(br)])); }
}
const headIds = Object.values(heads);
for(const a of headIds){ collab(a, ceo.id); for(const b of headIds) if(a<b && rnd()<0.6) collab(a,b); }

// ---------- derived node metadata ----------
for(const n of N){
  if(n.type==='Role') n.hc = sIn(n.id,'HOLDS').length;
  if(n.type==='Skill') n.holders = sIn(n.id,'HAS_SKILL').length;
  if(n.type==='Team') n.size = sIn(n.id,'MEMBER_OF').length;
  if(n.type==='Department') n.size = (peopleByDept[n.key]||[]).length + 1;
}

// ---------- layout (fixed "galaxy" positions) ----------
const DR = 400, SR = 690, GA = Math.PI*(3-Math.sqrt(5));
const totS = DEPTS.reduce((a,d)=>a+Math.sqrt(d.hc),0);
let a0 = -Math.PI/2 - Math.sqrt(DEPTS[0].hc)/totS*Math.PI;
for(const d of DEPTS){
  d.span = Math.sqrt(d.hc)/totS*2*Math.PI; d.a0=a0; d.a1=a0+d.span; d.ang=a0+d.span/2; a0+=d.span;
  d.rc = Math.min(7.6*Math.sqrt(d.hc), DR*Math.sin(d.span/2)*0.92);
  d.cx = DR*Math.cos(d.ang); d.cy = DR*Math.sin(d.ang);
  const dn = N[deptNode[d.key]]; dn.x=d.cx; dn.y=d.cy;
  const hd = N[heads[d.key]]; hd.x=d.cx; hd.y=d.cy;
  const tl = teamsByDept[d.key];
  tl.forEach((tid,j)=>{
    const rr = d.rc*0.86*Math.sqrt((j+1.2)/(tl.length+1.2)); const an = d.ang + j*GA;
    const t = N[tid]; t.x = d.cx + rr*Math.cos(an); t.y = d.cy + rr*Math.sin(an);
    const mem = membersOfTeam[tid].slice().sort((a,b)=> (a===t.lead?-1:b===t.lead?1:0));
    mem.forEach((pid,k)=>{ const r2 = 4.4*Math.sqrt(k+0.35); const a2 = k*GA + j; N[pid].x = t.x + r2*Math.cos(a2); N[pid].y = t.y + r2*Math.sin(a2); });
  });
  // roles on an arc just outside the cluster
  const roles = N.filter(n=>n.type==='Role' && n.dept===d.key).sort((a,b)=>a.sen-b.sen);
  roles.forEach((r,i)=>{ const f = roles.length===1?0.5:i/(roles.length-1); const an = d.ang + (f-0.5)*d.span*0.8; const rad = DR + d.rc + 42 + (i%2)*24; r.x=rad*Math.cos(an); r.y=rad*Math.sin(an); });
  // skills of the department's category on the outer ring
  const sks = SKILL_CATS[d.cat];
  sks.forEach((s,i)=>{ const f = sks.length===1?0.5:i/(sks.length-1); const an = d.ang + (f-0.5)*d.span*0.84; const rad = SR + (i%2)*30; const n=N[skillId[s]]; n.x=rad*Math.cos(an); n.y=rad*Math.sin(an); n.ang=an; n.rad=rad; });
}
TRANS.forEach((s,i)=>{ const an = -Math.PI/2 + (i+0.5)/TRANS.length*2*Math.PI; const n=N[skillId[s]]; n.x=150*Math.cos(an); n.y=150*Math.sin(an); n.ang=an; n.rad=150; });
ceo.x=0; ceo.y=0; const ceoRole = N[roleId.CEO]; ceoRole.x=0; ceoRole.y=34;
for(const n of N){ if(n.type!=='Course') continue; const s=N[n.skill]; const inner = s.rad<200; const rad = inner ? (n.adv? 238 : 205) : s.rad + (n.adv? 104 : 64); const off = n.adv? 0.012 : -0.012; n.x = rad*Math.cos(s.ang+off); n.y = rad*Math.sin(s.ang+off); }
{ const rad = SR + 175; const ms = deptByKey.OPS; const pos = {HS: ms.ang - ms.span*0.22, EQUIP: ms.ang + ms.span*0.22, DP: deptByKey.RC.ang};
  for(const k in certId){ const n=N[certId[k]]; n.x=rad*Math.cos(pos[k]); n.y=rad*Math.sin(pos[k]); } }

// ---------- query helpers ----------
const esc = s => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = v => Math.round(v*100)+'%';
const roleOf = pid => out(pid,'HOLDS')[0].t;
const SHORT = {ENG:'Product & Eng.',CS:'Customer Success',SM:'Sales & Mktg',FIN:'Finance',HR:'People & Culture',DIT:'Data & IT',RC:'Risk & Compliance',OPS:'Operations',EXEC:'Executive'};
const deptName = k => deptByKey[k] ? deptByKey[k].name : k;
const deptShort = k => SHORT[k] || deptName(k);
function fitDetail(pid, reqs){
  const have = new Map(out(pid,'HAS_SKILL').map(e=>[e.t,e]));
  let num=0, den=0, met=0; const detail=[];
  for(const r of reqs){ const h=have.get(r.t); const l=h?h.level:0; num+=Math.min(l,r.level); den+=r.level; if(l>=r.level) met++; detail.push({s:r.t, req:r.level, have:l, e:h}); }
  return {fit: den? num/den : 0, met, n:reqs.length, detail, have};
}
const stColor = (have,req) => have>=req ? C.ok : have>0 ? C.warn : C.bad;
const lineIdx = (lines, ...needles) => needles.map(nd => lines.findIndex(l=>l.includes(nd))).filter(i=>i>=0);
const q = s => '"' + s + '"';

// ---------- the queries ----------
const QUERIES = [];

QUERIES.push({ id:'gap', title:'Skills gap to a target role', tag:'MyCareer', params:['person','role'],
  question: P => `What does ${N[P.person].name} still need to become ${N[P.role].name}?`,
  advantage:['Low','A two-table join with a LEFT JOIN. Snowflake answers this just as well; the graph adds nothing here except reusing the same model.'],
  cypher: P => [
    `MATCH (p:Person {name: ${q(N[P.person].name)}})`,
    `MATCH (target:Role {title: ${q(N[P.role].name)}})-[req:REQUIRES]->(s:Skill)`,
    `OPTIONAL MATCH (p)-[has:HAS_SKILL]->(s)`,
    `WITH s, req.level AS required, coalesce(has.level, 0) AS current, has.source AS evidence`,
    `RETURN s.name AS skill, required, current, required - current AS gap, evidence`,
    `ORDER BY gap DESC`],
  sql: P => [
    `SELECT s.name AS skill, rr.level AS required,`,
    `       COALESCE(ps.level, 0) AS current,`,
    `       rr.level - COALESCE(ps.level, 0) AS gap, ps.source AS evidence`,
    `FROM role_requirement rr`,
    `JOIN skill s ON s.skill_id = rr.skill_id`,
    `LEFT JOIN person_skill ps`,
    `  ON ps.skill_id = rr.skill_id AND ps.person_id = :person_id`,
    `WHERE rr.role_id = :role_id`,
    `ORDER BY gap DESC;`],
  run(P){
    const p=N[P.person], r=N[P.role], steps=[];
    const cur = roleOf(p.id);
    steps.push({title:'Find the person', detail:`Index seek on :Person(name) returns one node: ${p.name}, currently ${N[cur].name}.`, nodes:[p.id,cur], edges:[[p.id,cur,C.muted]], labels:[p.id,cur], line:[0]});
    steps.push({title:'Find the target role', detail:`Index seek on :Role(title) returns ${r.name}.`, nodes:[r.id], labels:[r.id], line:[1]});
    const req = out(r.id,'REQUIRES');
    steps.push({title:'Expand REQUIRES', detail:`Follow the ${req.length} REQUIRES relationships stored on the role node. No table scan: the role points straight at its skills.`, nodes:req.map(e=>e.t), edges:req.map(e=>[r.id,e.t,C.role]), labels:req.map(e=>e.t), line:[1]});
    const f = fitDetail(p.id, req);
    const nodeColor={}, edges=[], rows=[];
    for(const d of f.detail){ const col=stColor(d.have,d.req); nodeColor[d.s]=col; if(d.e) edges.push([p.id,d.s,col,1.6]);
      rows.push({skill:N[d.s].name, level:{have:d.have,req:d.req}, gap:Math.max(0,d.req-d.have), evidence:d.e? d.e.source+' ('+pct(d.e.confidence)+')' : 'No evidence', _node:d.s}); }
    const missing = f.detail.filter(d=>!d.e).length;
    steps.push({title:'Match the person’s HAS_SKILL edges', detail:`Read the ${f.have.size} HAS_SKILL edges on ${p.name}. ${f.met} of ${req.length} requirements are met; ${missing} skill${missing===1?' has':'s have'} no evidence at all.`, nodes:req.map(e=>e.t), nodeColor, edges, line:[2], legend:'gap'});
    rows.sort((a,b)=>b.gap-a.gap || b.level.req-a.level.req);
    steps.push({title:'Compute gaps, return rows', detail:'gap = required − current, sorted by size.', nodes:[], line:[3,4,5]});
    const top = rows.filter(r=>r.gap>0).slice(0,2).map(r=>esc(r.skill)).join(' and ');
    return {steps, cols:[{k:'skill',l:'Skill'},{k:'level',l:'Has / required',t:'pips'},{k:'gap',l:'Gap',t:'num'},{k:'evidence',l:'Evidence (confidence)'}], rows,
      foot:'Levels run 1–5; 0 = no evidence. Skill fit = sum of the person’s levels, each capped at the required level, ÷ sum of required levels.',
      summary:`<b>${esc(p.name)}</b> meets <b>${f.met} of ${req.length}</b> requirements for <b>${esc(r.name)}</b> (skill fit ${pct(f.fit)}).` + (top? ` Biggest gaps: ${top}.`:' No gaps.') + ` Try <i>Learning path + mentors</i> next to see how to close them.`};
  }});

QUERIES.push({ id:'career', title:'Reachable career paths', tag:'MyCareer', params:['person'],
  question: P => `Which roles have people actually moved to from ${N[P.person].name}’s current role, within two moves, and how well does ${N[P.person].name.split(' ')[0]} fit them?`,
  advantage:['High','Variable-length paths over observed role transitions. In SQL you first derive a transitions table from job history, then write a recursive CTE; adding a third hop or a path constraint gets awkward fast.'],
  cypher: P => [
    `MATCH (p:Person {name: ${q(N[P.person].name)}})-[:HOLDS]->(current:Role)`,
    `MATCH path = (current)-[:MOVED_TO*1..2]->(next:Role)`,
    `WHERE next <> current`,
    `WITH p, next, min(length(path)) AS hops,`,
    `     max(reduce(m = 9999, r IN relationships(path) | CASE WHEN r.moves < m THEN r.moves ELSE m END)) AS observed_moves`,
    `MATCH (next)-[req:REQUIRES]->(s:Skill)`,
    `OPTIONAL MATCH (p)-[has:HAS_SKILL]->(s)`,
    `WITH next, hops, observed_moves,`,
    `     sum(CASE WHEN coalesce(has.level,0) < req.level THEN coalesce(has.level,0) ELSE req.level END) * 1.0 / sum(req.level) AS fit`,
    `RETURN next.title, hops, observed_moves, fit`,
    `ORDER BY fit DESC LIMIT 10`],
  sql: P => [
    `-- 1. derive role transitions from job history (window function)`,
    `CREATE TEMP TABLE role_transition AS`,
    `SELECT role_id AS from_role, next_role AS to_role, COUNT(*) AS moves FROM (`,
    `  SELECT person_id, role_id,`,
    `         LEAD(role_id) OVER (PARTITION BY person_id ORDER BY start_date) AS next_role`,
    `  FROM job_history) WHERE next_role IS NOT NULL GROUP BY 1, 2;`,
    `-- 2. walk up to two hops`,
    `WITH RECURSIVE paths (role_id, hops, moves) AS (`,
    `  SELECT t.to_role, 1, t.moves FROM role_transition t`,
    `  JOIN employee e ON e.role_id = t.from_role WHERE e.person_id = :person_id`,
    `  UNION ALL`,
    `  SELECT t.to_role, p.hops + 1, LEAST(p.moves, t.moves)`,
    `  FROM paths p JOIN role_transition t ON t.from_role = p.role_id`,
    `  WHERE p.hops < 2)`,
    `SELECT p.role_id, MIN(p.hops) AS hops, MAX(p.moves) AS observed_moves,`,
    `       SUM(LEAST(COALESCE(ps.level,0), rr.level)) / SUM(rr.level) AS fit`,
    `FROM (SELECT DISTINCT role_id, hops, moves FROM paths) p`,
    `JOIN role_requirement rr ON rr.role_id = p.role_id`,
    `LEFT JOIN person_skill ps ON ps.skill_id = rr.skill_id AND ps.person_id = :person_id`,
    `GROUP BY p.role_id ORDER BY fit DESC LIMIT 10;`],
  run(P){
    const p=N[P.person], steps=[];
    const cur = roleOf(p.id);
    steps.push({title:'Start at the person’s current role', detail:`${p.name} → HOLDS → ${N[cur].name}.`, nodes:[p.id,cur], edges:[[p.id,cur,C.muted]], labels:[p.id,cur], line:[0]});
    const cand = new Map();
    const h1 = out(cur,'MOVED_TO').filter(e=>e.t!==cur);
    for(const e of h1) cand.set(e.t,{hops:1, moves:e.moves, via:null});
    steps.push({title:'Hop 1: follow MOVED_TO', detail: h1.length ? `${h1.length} roles that people have moved to directly from ${N[cur].name} (${h1.reduce((a,e)=>a+e.moves,0)} observed moves).` : `Nobody in the history has moved on from ${N[cur].name}.`, nodes:h1.map(e=>e.t), edges:h1.map(e=>[cur,e.t,C.role,1+Math.min(e.moves,12)/4]), labels:h1.map(e=>e.t), line:[1,2]});
    const h2e = [];
    for(const e of h1) for(const e2 of out(e.t,'MOVED_TO')){ if(e2.t===cur) continue; h2e.push([e.t,e2.t,C.role,1+Math.min(e2.moves,12)/4]); const m=Math.min(e.moves,e2.moves); const c=cand.get(e2.t); if(!c) cand.set(e2.t,{hops:2,moves:m,via:e.t}); else if(c.hops===2 && m>c.moves){ c.moves=m; c.via=e.t; } }
    const h2n = [...new Set(h2e.map(x=>x[1]))].filter(id=>cand.get(id).hops===2);
    steps.push({title:'Hop 2: follow MOVED_TO again', detail:`${h2n.length} more roles reachable in two moves.`, nodes:h2n, edges:h2e, labels:h2n, line:[1,3,4]});
    const rows=[], reqEdges=[], skillNodes=new Set(), nodeColor={};
    for(const [rid,c] of cand){ const req=out(rid,'REQUIRES'); const f=fitDetail(p.id, req); for(const d of f.detail){ reqEdges.push([rid,d.s,stColor(d.have,d.req),0.8]); skillNodes.add(d.s);}
      const gaps = f.detail.filter(d=>d.have<d.req).sort((a,b)=>(b.req-b.have)-(a.req-a.have));
      rows.push({role:N[rid].name, dept:deptShort(N[rid].dept), hops:c.hops, moves:c.moves, fit:f.fit, gap: gaps.length? N[gaps[0].s].name : '—', _node:rid}); }
    steps.push({title:'Score each role against the person’s skills', detail:`Expand REQUIRES on ${cand.size} candidate roles and compare with ${p.name.split(' ')[0]}’s HAS_SKILL levels. Green = already met, amber = partly, red = missing.`, nodes:[...skillNodes], edges:reqEdges, line:[5,6,7,8], legend:'gap', edgeAlpha:0.55});
    rows.sort((a,b)=>b.fit-a.fit || b.moves-a.moves);
    const topR = rows.slice(0,10);
    steps.push({title:'Rank and return', detail:'Order by skill fit, keep 10.', nodes:topR.map(r=>r._node), nodeColor, labels:topR.map(r=>r._node), line:[9,10]});
    const best = topR[0];
    return {steps, cols:[{k:'role',l:'Role'},{k:'fit',l:'Skill fit',t:'pct'},{k:'hops',l:'Steps',t:'num'},{k:'moves',l:'Observed moves',t:'num'},{k:'gap',l:'Biggest gap'},{k:'dept',l:'Department'}], rows:topR,
      foot:'Steps = role changes needed. Observed moves = people in the job history who made that move; for two-step paths, the count on the weaker of the two links. Skill fit = sum of the person’s levels, each capped at the required level, ÷ sum of required levels.',
      summary: best ? `From <b>${esc(N[cur].name)}</b>, ${cand.size} roles are reachable in one or two observed moves. Best fit for ${esc(p.name)}: <b>${esc(best.role)}</b> (${pct(best.fit)}). Paths come from real moves in the job history, not from an org chart.` : `No observed moves out of ${esc(N[cur].name)} yet, so the graph has no evidence-based paths. Pick another person.`};
  }});

QUERIES.push({ id:'talent', title:'Internal talent for a role', tag:'Talent mobility', params:['role'],
  question: P => `Who across the company could step into ${N[P.role].name}, based on skills rather than job titles?`,
  advantage:['Low–Medium','A join plus GROUP BY. Fine in SQL. The graph helps when you keep pivoting: from a candidate to their manager, their courses, their network.'],
  cypher: P => [
    `MATCH (target:Role {title: ${q(N[P.role].name)}})-[req:REQUIRES]->(s:Skill)`,
    `WITH target, sum(req.level) AS total`,
    `MATCH (target)-[req:REQUIRES]->(s:Skill)<-[has:HAS_SKILL]-(p:Person)`,
    `WHERE NOT (p)-[:HOLDS]->(target)`,
    `WITH p, total,`,
    `     sum(CASE WHEN has.level < req.level THEN has.level ELSE req.level END) * 1.0 / total AS fit,`,
    `     sum(CASE WHEN has.level >= req.level THEN 1 ELSE 0 END) AS met`,
    `WHERE fit >= 0.7`,
    `MATCH (p)-[:HOLDS]->(current:Role)`,
    `RETURN p.name, current.title, p.department, fit, met`,
    `ORDER BY fit DESC LIMIT 12`],
  sql: P => [
    `WITH req AS (SELECT skill_id, level FROM role_requirement WHERE role_id = :role_id),`,
    `total AS (SELECT SUM(level) AS t FROM req)`,
    `SELECT e.person_id, e.role_id AS current_role, e.department,`,
    `       SUM(LEAST(ps.level, req.level)) / MAX(total.t) AS fit,`,
    `       SUM(IFF(ps.level >= req.level, 1, 0)) AS met`,
    `FROM req JOIN person_skill ps ON ps.skill_id = req.skill_id`,
    `JOIN employee e ON e.person_id = ps.person_id CROSS JOIN total`,
    `WHERE e.role_id <> :role_id`,
    `GROUP BY 1, 2, 3 HAVING fit >= 0.7`,
    `ORDER BY fit DESC LIMIT 12;`],
  run(P){
    const r=N[P.role], steps=[];
    steps.push({title:'Find the role', detail:`Index seek: ${r.name} (${r.hc} people hold it today).`, nodes:[r.id], labels:[r.id], line:[0]});
    const req = out(r.id,'REQUIRES'); const total = req.reduce((a,e)=>a+e.level,0);
    steps.push({title:'Expand REQUIRES', detail:`${req.length} required skills, total required level ${total}.`, nodes:req.map(e=>e.t), edges:req.map(e=>[r.id,e.t,C.role]), labels:req.map(e=>e.t), line:[0,1]});
    const incumbents = new Set(inn(r.id,'HOLDS').map(e=>e.s));
    const agg = new Map(); const fan=[];
    for(const e of req){ for(const h of inn(e.t,'HAS_SKILL')){ fan.push([h.s,e.t,C.person,0.6]); if(incumbents.has(h.s)) continue; let a=agg.get(h.s); if(!a){a={num:0,met:0,val:0};agg.set(h.s,a);} a.num+=Math.min(h.level,e.level); if(h.level>=e.level){a.met++; if(h.source==='Manager-validated') a.val++;} } }
    steps.push({title:'Walk backwards: Skill ← HAS_SKILL ← Person', detail:`${fan.length.toLocaleString('en')} HAS_SKILL edges point into those skills, from ${agg.size + incumbents.size} different people. This is the expensive step, and it only touches people who hold at least one relevant skill.`, nodes:[...new Set(fan.map(x=>x[0]))], edges:fan, line:[2,3], edgeAlpha:0.22, dimNodes:true});
    const list = [...agg.entries()].map(([pid,a])=>({pid, fit:a.num/total, met:a.met, val:a.val})).filter(x=>x.fit>=0.7).sort((a,b)=>b.fit-a.fit || b.val-a.val);
    const top = list.slice(0,12);
    const edges=[], nodeColor={};
    for(const c of top){ for(const e of req){ const lv=N[c.pid].sk[e.t]||0; if(lv) edges.push([c.pid,e.t,stColor(lv,e.level),1.2]); } nodeColor[c.pid]=C.person; }
    steps.push({title:'Aggregate per person, keep fit ≥ 70%', detail:`${list.length} people clear the bar; the top 12 are shown with their skill evidence.`, nodes:top.map(c=>c.pid), nodeColor, edges, labels:top.map(c=>c.pid), line:[4,5,6,7], legend:'gap'});
    const hEdges = top.map(c=>[c.pid, N[c.pid].role, C.muted, 0.8]);
    steps.push({title:'Look up their current roles', detail:'One HOLDS hop per candidate.', nodes:top.map(c=>N[c.pid].role), edges:hEdges, labels:[...new Set(top.map(c=>N[c.pid].role))], line:[8,9,10]});
    const rows = top.map(c=>({name:N[c.pid].name, current:N[N[c.pid].role].name, dept:deptShort(N[c.pid].dept), fit:c.fit, met:`${c.met}/${req.length}`, _node:c.pid}));
    const outside = top.filter(c=>N[c.pid].dept!==r.dept).length;
    return {steps, cols:[{k:'name',l:'Person'},{k:'fit',l:'Skill fit',t:'pct'},{k:'met',l:'Requirements met',t:'num'},{k:'current',l:'Current role'},{k:'dept',l:'Department'}], rows,
      foot:'Skill fit = sum of the person’s levels, each capped at the required level, ÷ sum of required levels. The 70% cut-off is a demo assumption, not an agreed rule.',
      summary:`<b>${list.length}</b> people outside the current ${r.hc} ${esc(r.name)}s reach ≥70% skill fit. <b>${outside} of the top ${top.length}</b> sit outside ${esc(deptName(r.dept))}: candidates a search by job title alone would not return.`};
  }});

QUERIES.push({ id:'learn', title:'Learning path + mentors', tag:'Learning', params:['person','role'],
  question: P => `Which courses (with prerequisites) and which colleagues could help ${N[P.person].name} close the gap to ${N[P.role].name}?`,
  advantage:['High','Prerequisite chains of unknown depth plus a mentor lookup in one pattern. Recursive SQL can do it, but it is brittle and hard to read.'],
  cypher: P => [
    `MATCH (p:Person {name: ${q(N[P.person].name)}}), (target:Role {title: ${q(N[P.role].name)}})`,
    `MATCH (target)-[req:REQUIRES]->(s:Skill)`,
    `OPTIONAL MATCH (p)-[has:HAS_SKILL]->(s)`,
    `WITH p, s, req WHERE coalesce(has.level, 0) < req.level`,
    `OPTIONAL MATCH (c:Course)-[t:TEACHES]->(s) WHERE t.up_to >= req.level`,
    `OPTIONAL MATCH (c)-[:REQUIRES_COURSE*0..3]->(pre:Course)`,
    `WHERE NOT (p)-[:COMPLETED]->(pre)`,
    `OPTIONAL MATCH (mentor:Person)-[m:HAS_SKILL]->(s)`,
    `WHERE m.level >= 4 AND mentor.location = p.location AND mentor <> p`,
    `RETURN s.name, collect(DISTINCT pre.title) AS courses,`,
    `       collect(DISTINCT mentor.name)[0..2] AS mentors`],
  sql: P => [
    `WITH RECURSIVE gaps AS (`,
    `  SELECT rr.skill_id, rr.level FROM role_requirement rr`,
    `  LEFT JOIN person_skill ps ON ps.skill_id = rr.skill_id AND ps.person_id = :person_id`,
    `  WHERE rr.role_id = :role_id AND COALESCE(ps.level, 0) < rr.level),`,
    `chain (course_id, depth) AS (`,
    `  SELECT ct.course_id, 0 FROM course_teaches ct JOIN gaps g`,
    `    ON g.skill_id = ct.skill_id AND ct.up_to >= g.level`,
    `  UNION ALL`,
    `  SELECT cp.prereq_id, c.depth + 1 FROM chain c`,
    `  JOIN course_prereq cp ON cp.course_id = c.course_id WHERE c.depth < 3)`,
    `SELECT DISTINCT course_id, MAX(depth) AS depth FROM chain`,
    `WHERE course_id NOT IN (SELECT course_id FROM completion WHERE person_id = :person_id)`,
    `GROUP BY 1 ORDER BY depth DESC;`,
    `-- mentors need a second query (person_skill JOIN employee ON location)`],
  run(P){
    const p=N[P.person], r=N[P.role], steps=[];
    const req = out(r.id,'REQUIRES'); const f = fitDetail(p.id, req);
    const gaps = f.detail.filter(d=>d.have<d.req);
    const nodeColor={}; f.detail.forEach(d=>nodeColor[d.s]=stColor(d.have,d.req));
    steps.push({title:'Find the gaps', detail:`${p.name} vs ${r.name}: ${gaps.length} skill${gaps.length===1?'':'s'} below the required level.`, nodes:[p.id,r.id,...req.map(e=>e.t)], nodeColor, edges:req.map(e=>[r.id,e.t,nodeColor[e.t],1]), labels:[p.id,r.id,...gaps.map(d=>d.s)], line:[0,1,2,3], legend:'gap'});
    const done = new Set(out(p.id,'COMPLETED').map(e=>e.t));
    const chosen = []; const cEdges=[]; const noCourse=[];
    for(const g of gaps){ const cs = inn(g.s,'TEACHES'); if(!cs.length){ noCourse.push(g.s); continue; }
      cs.sort((a,b)=>a.upTo-b.upTo); const pickC = cs.find(e=>e.upTo>=g.req) || cs[cs.length-1];
      chosen.push({c:pickC.s, s:g.s}); cEdges.push([pickC.s,g.s,C.course,1.4]); }
    steps.push({title:'Skill ← TEACHES ← Course', detail:`${chosen.length} courses teach the missing skills to the required level.` + (noCourse.length? ` ${noCourse.length} gap${noCourse.length===1?' has':'s have'} no course in the catalog (${noCourse.map(s=>N[s].name).join(', ')}).`:''), nodes:chosen.map(x=>x.c), edges:cEdges, labels:chosen.map(x=>x.c), line:[4]});
    // prerequisites, depth-first, post-order = valid study order
    const order=[]; const seen=new Set(); const pEdges=[]; const pNodes=[]; const why={};
    function visit(cid, depth){ if(seen.has(cid)) return; seen.add(cid); for(const e of out(cid,'REQUIRES_COURSE')){ pEdges.push([cid,e.t,C.course,1,true]); pNodes.push(e.t); if(!why[e.t]) why[e.t]='Prerequisite for '+N[cid].name; visit(e.t, depth+1); } order.push(cid); }
    for(const x of chosen){ why[x.c]='Closes '+N[x.s].name; visit(x.c,0); }
    const pc = {}; pNodes.forEach(id=>pc[id]= done.has(id)? C.ok : C.course);
    steps.push({title:'Follow REQUIRES_COURSE*0..3', detail:`Prerequisite chains add ${new Set(pNodes).size} course${new Set(pNodes).size===1?'':'s'}; ${order.filter(c=>done.has(c)).length} already completed (green).`, nodes:pNodes, nodeColor:pc, edges:pEdges, labels:pNodes, line:[5,6]});
    const mentors={}; const mEdges=[]; const mNodes=[];
    for(const g of gaps){ const cands = inn(g.s,'HAS_SKILL').filter(e=>e.level>=4 && e.s!==p.id);
      cands.sort((a,b)=> (N[b.s].loc===p.loc)-(N[a.s].loc===p.loc) || (b.source==='Manager-validated')-(a.source==='Manager-validated') || b.level-a.level);
      const m = cands[0]; if(m){ mentors[g.s]=m.s; mEdges.push([m.s,g.s,C.person,1.2]); mNodes.push(m.s);} }
    steps.push({title:'Find mentors: Skill ← HAS_SKILL {level ≥ 4}', detail:`Prefer experts in ${p.loc} with manager-validated evidence.`, nodes:mNodes, edges:mEdges, labels:mNodes, line:[7,8]});
    const rows=[]; let hours=0, i=0;
    for(const cid of order){ const c=N[cid]; const isDone=done.has(cid); if(!isDone) hours+=c.hours; const ms=N[c.skill];
      rows.push({n:isDone?'✓':String(++i), course:c.name, why:why[cid]||'', hours:isDone? 'done' : c.hours+' h', mentor: mentors[c.skill]!=null ? N[mentors[c.skill]].name : '—', _node:cid}); }
    for(const s of noCourse) rows.push({n:'·', course:'No catalog course', why:'Closes '+N[s].name, hours:'on the job', mentor: mentors[s]!=null? N[mentors[s]].name : '—', _node: mentors[s]!=null? mentors[s] : s});
    steps.push({title:'Order by prerequisites, return plan', detail:'Post-order traversal gives a valid study sequence.', nodes:[], line:[9,10]});
    return {steps, cols:[{k:'n',l:'Order'},{k:'course',l:'Course'},{k:'why',l:'Why'},{k:'hours',l:'Effort'},{k:'mentor',l:'Mentor'}], rows,
      foot:'✓ = already completed. Mentors hold the skill at level 4–5; same location and manager-validated evidence are preferred.',
      summary: gaps.length ? `<b>${i} course${i===1?'':'s'}, about ${hours} hours</b>, plus ${Object.keys(mentors).length} mentor${Object.keys(mentors).length===1?'':'s'} for ${gaps.length} gap${gaps.length===1?'':'s'}.` + (noCourse.length? ` <b>${noCourse.length}</b> gap${noCourse.length===1?'':'s'} can only be closed on the job, which also flags a hole in the course catalog.`:'') : `${esc(p.name)} already meets every requirement for ${esc(r.name)}.`};
  }});

QUERIES.push({ id:'succession', title:'Succession bench', tag:'Succession', params:['leader'],
  question: P => `Who could succeed ${N[P.leader].name} (${N[N[P.leader].role].name}), inside and outside the reporting line?`,
  advantage:['Medium','A recursive CTE on the reporting line works in Snowflake. The graph version stays short when you add matrix or dotted-line reporting, or search beyond the line.'],
  cypher: P => [
    `MATCH (leader:Person {name: ${q(N[P.leader].name)}})-[:HOLDS]->(r:Role)`,
    `MATCH (c:Person)-[:REPORTS_TO*1..3]->(leader)`,
    `MATCH (r)-[req:REQUIRES]->(s:Skill)`,
    `OPTIONAL MATCH (c)-[has:HAS_SKILL]->(s)`,
    `WITH c, sum(CASE WHEN coalesce(has.level,0) < req.level THEN coalesce(has.level,0) ELSE req.level END) * 1.0 / sum(req.level) AS fit`,
    `RETURN c.name, fit, c.performance,`,
    `  CASE WHEN fit >= 0.8 AND c.performance >= 4 THEN 'Ready now'`,
    `       WHEN fit >= 0.65 THEN 'Ready in 1–2 years' END AS readiness`,
    `UNION // beyond the reporting line`,
    `MATCH (leader)-[:HOLDS]->(r)-[req:REQUIRES {core: true}]->(:Skill)<-[has:HAS_SKILL]-(ext:Person)`,
    `WHERE has.level >= req.level AND NOT (ext)-[:REPORTS_TO*1..3]->(leader) AND ext <> leader`,
    `...same fit calculation...`],
  sql: P => [
    `WITH RECURSIVE tree (person_id, depth) AS (`,
    `  SELECT person_id, 1 FROM employee WHERE manager_id = :leader_id`,
    `  UNION ALL`,
    `  SELECT e.person_id, t.depth + 1 FROM employee e`,
    `  JOIN tree t ON e.manager_id = t.person_id WHERE t.depth < 3)`,
    `SELECT t.person_id, t.depth,`,
    `       SUM(LEAST(COALESCE(ps.level,0), rr.level)) / SUM(rr.level) AS fit`,
    `FROM tree t`,
    `CROSS JOIN role_requirement rr`,
    `LEFT JOIN person_skill ps ON ps.person_id = t.person_id AND ps.skill_id = rr.skill_id`,
    `WHERE rr.role_id = (SELECT role_id FROM employee WHERE person_id = :leader_id)`,
    `GROUP BY 1, 2 ORDER BY fit DESC;`,
    `-- "beyond the line" = a second query with an anti-join on tree`],
  run(P){
    const L=N[P.leader], steps=[];
    const rid = roleOf(L.id);
    steps.push({title:'Find the leader and their role', detail:`${L.name} holds ${N[rid].name}.`, nodes:[L.id,rid], edges:[[L.id,rid,C.muted]], labels:[L.id,rid], line:[0]});
    const depth = new Map(); let frontier=[L.id];
    for(let d=1; d<=3; d++){
      const next=[], ed=[];
      for(const x of frontier) for(const e of inn(x,'REPORTS_TO')){ if(depth.has(e.s)) continue; depth.set(e.s,d); next.push(e.s); ed.push([e.s,x,C.person,0.9]); }
      if(!next.length) break;
      steps.push({title:`REPORTS_TO, level ${d}`, detail:`${next.length} people ${d===1?'report directly':'sit '+d+' levels down'}.`, nodes:next, edges:ed, line:[1], labels: next.length<=12? next : [], edgeAlpha: next.length>150?0.45:0.8});
      frontier = next;
    }
    const req = out(rid,'REQUIRES');
    const scored = [...depth.keys()].map(pid=>{ const f=fitDetail(pid, req); return {pid, fit:f.fit, perf:N[pid].perf, d:depth.get(pid)}; });
    const readiness = x => x.fit>=0.8 && x.perf>=4 ? 'Ready now' : x.fit>=0.65 ? 'Ready in 1–2 years' : null;
    const bench = scored.filter(x=>readiness(x)).sort((a,b)=>b.fit-a.fit || b.perf-a.perf);
    const nodeColor={}; bench.forEach(x=>nodeColor[x.pid]= readiness(x)==='Ready now'? C.ok : C.warn);
    steps.push({title:'Score everyone in the line against the role', detail:`Compare ${scored.length} people with the ${req.length} requirements of ${N[rid].name}. ${bench.filter(x=>readiness(x)==='Ready now').length} ready now (green), ${bench.filter(x=>readiness(x)!=='Ready now').length} ready in 1–2 years (amber).`, nodes:bench.map(x=>x.pid), nodeColor, labels:bench.slice(0,8).map(x=>x.pid), line:[2,3,4,5,6,7], legend:'ready'});
    // beyond the line
    const core = req.filter(e=>e.core); const inTree = depth; const ext=new Map(); const fan=[];
    for(const e of core) for(const h of inn(e.t,'HAS_SKILL')){ if(h.level<e.level || inTree.has(h.s) || h.s===L.id) continue; ext.set(h.s,(ext.get(h.s)||0)+1); }
    const extScored = [...ext.keys()].filter(pid=>ext.get(pid)>=2).map(pid=>{ const f=fitDetail(pid, req); return {pid, fit:f.fit, perf:N[pid].perf, d:0}; }).filter(x=>x.fit>=0.8 && x.perf>=4).sort((a,b)=>b.fit-a.fit).slice(0,5);
    for(const x of extScored) for(const e of core){ const lv=N[x.pid].sk[e.t]||0; if(lv>=e.level) fan.push([x.pid,e.t,C.ok,1.2]); }
    const ec={}; extScored.forEach(x=>ec[x.pid]=C.ok);
    steps.push({title:'Beyond the reporting line', detail:`Walk backwards from the role’s core skills to people elsewhere with ≥ 80% fit and strong performance: ${extScored.length} found.`, nodes:[...extScored.map(x=>x.pid), ...core.map(e=>e.t)], nodeColor:ec, edges:fan, labels:[...extScored.map(x=>x.pid), ...core.map(e=>e.t)], line:[8,9,10,11]});
    const rel = d => d===1?'Direct report': d===2?'Skip-level': d===3?'3 levels down':'Other part of org';
    const rows = bench.slice(0,10).concat(extScored).map(x=>({name:N[x.pid].name, current:N[N[x.pid].role].name, rel:rel(x.d), fit:x.fit, perf:x.perf, ready:{text: x.d===0? 'Ready now · external to line' : readiness(x), cls: (x.d===0||readiness(x)==='Ready now')?'ok':'warn'}, _node:x.pid}));
    const now = bench.filter(x=>readiness(x)==='Ready now').length;
    return {steps, cols:[{k:'name',l:'Candidate'},{k:'ready',l:'Readiness',t:'pill'},{k:'fit',l:'Skill fit',t:'pct'},{k:'perf',l:'Performance (1–5)',t:'num'},{k:'rel',l:'Relation'},{k:'current',l:'Current role'}], rows,
      foot:'Skill fit = sum of the person’s levels, each capped at the required level, ÷ sum of required levels. Readiness rule (demo assumption): ready now = fit ≥ 80% and performance ≥ 4; ready in 1–2 years = fit ≥ 65%. In production, performance data would need role-based access.',
      summary:`Bench for <b>${esc(N[rid].name)}</b>: <b>${now} ready now</b> and ${bench.length-now} ready in 1–2 years inside the line, plus <b>${extScored.length}</b> strong match${extScored.length===1?'':'es'} elsewhere in the company.` + (now===0? ' A thin internal bench is a finding in itself.' : '')};
  }});

QUERIES.push({ id:'ona', title:'Who bridges two departments?', tag:'ONA', params:['deptA','deptB'],
  question: P => `Which people carry the collaboration between ${N[P.deptA].name} and ${N[P.deptB].name}?`,
  advantage:['Medium','One-hop ties are fine in SQL. A graph engine pays off for network algorithms such as betweenness or community detection. This demo uses a plain tie count.'],
  cypher: P => [
    `MATCH (:Department {name: ${q(N[P.deptA].name)}})<-[:PART_OF]-(:Team)<-[:MEMBER_OF]-(a:Person)`,
    `MATCH (:Department {name: ${q(N[P.deptB].name)}})<-[:PART_OF]-(:Team)<-[:MEMBER_OF]-(b:Person)`,
    `MATCH (a)-[c:COLLABORATES_WITH]-(b)`,
    `UNWIND [a, b] AS broker`,
    `RETURN broker.name, broker.department, count(DISTINCT c) AS cross_ties`,
    `ORDER BY cross_ties DESC LIMIT 10`,
    `// production: CALL gds.betweenness.stream(...) on the collaboration projection`],
  sql: P => [
    `SELECT broker_id, COUNT(DISTINCT tie_id) AS cross_ties FROM (`,
    `  SELECT c.tie_id, c.person_a AS broker_id FROM collaboration c`,
    `  JOIN employee a ON a.person_id = c.person_a JOIN employee b ON b.person_id = c.person_b`,
    `  WHERE (a.dept = :A AND b.dept = :B) OR (a.dept = :B AND b.dept = :A)`,
    `  UNION ALL`,
    `  SELECT c.tie_id, c.person_b FROM collaboration c`,
    `  JOIN employee a ON a.person_id = c.person_a JOIN employee b ON b.person_id = c.person_b`,
    `  WHERE (a.dept = :A AND b.dept = :B) OR (a.dept = :B AND b.dept = :A))`,
    `GROUP BY 1 ORDER BY cross_ties DESC LIMIT 10;`],
  run(P){
    const A=N[P.deptA], B=N[P.deptB], steps=[];
    if(A.id===B.id){ steps.push({title:'Find the department', detail:`${A.name} was chosen twice.`, nodes:[A.id], labels:[A.id], line:[0]}); return {steps, cols:[], rows:[], summary:'Pick two <b>different</b> departments to see who connects them.'}; }
    function members(D,col){ const ppl=[], ed=[]; for(const t of inn(D.id,'PART_OF')){ ed.push([t.s,D.id,C.team,0.7]); for(const m of inn(t.s,'MEMBER_OF')){ ppl.push(m.s); ed.push([m.s,t.s,col,0.5]); } } return {ppl, ed}; }
    const ma = members(A,C.deptA), mb = members(B,C.deptB);
    const nca={}; ma.ppl.forEach(id=>nca[id]=C.deptA); const ncb={}; mb.ppl.forEach(id=>ncb[id]=C.deptB);
    const ona = [[C.deptA, A.name],[C.deptB, B.name],[C.link,'Cross-department tie'],[C.focus,'Top-5 broker and their ties']];
    steps.push({title:`Members of ${A.name}`, detail:`Department ← PART_OF ← Team ← MEMBER_OF ← Person: ${ma.ppl.length} people.`, nodes:[A.id,...ma.ppl], nodeColor:nca, edges:ma.ed, labels:[A.id], line:[0], edgeAlpha:0.35, legend:ona.slice(0,1)});
    steps.push({title:`Members of ${B.name}`, detail:`Same pattern: ${mb.ppl.length} people.`, nodes:[B.id,...mb.ppl], nodeColor:ncb, edges:mb.ed, labels:[B.id], line:[1], edgeAlpha:0.35, legend:ona.slice(0,2)});
    const setB = new Set(mb.ppl); const ties=new Map(); const cnt=new Map();
    for(const a of ma.ppl) for(const {e,o} of both(a,'COLLABORATES_WITH')){ if(!setB.has(o)) continue; ties.set(e.id,e); for(const x of [a,o]){ if(!cnt.has(x)) cnt.set(x,new Set()); cnt.get(x).add(e.id);} }
    const tieEdges = [...ties.values()].map(e=>[e.s,e.t,C.link,1]);
    steps.push({title:'Expand COLLABORATES_WITH across the boundary', detail:`${ties.size} collaboration ties connect the two departments (from ${ma.ppl.length} × ${mb.ppl.length} possible pairs).`, nodes:[...cnt.keys()], edges:tieEdges, line:[2], edgeAlpha:0.75, legend:ona.slice(0,3)});
    const ranked = [...cnt.entries()].map(([pid,s])=>({pid,n:s.size})).sort((a,b)=>b.n-a.n);
    const top = ranked.slice(0,10); const top5 = new Set(ranked.slice(0,5).map(x=>x.pid));
    const via5 = [...ties.values()].filter(e=>top5.has(e.s)||top5.has(e.t)).length;
    const zeroA = ma.ppl.filter(id=>!cnt.has(id)).length;
    const nc={}; top.slice(0,5).forEach(x=>nc[x.pid]=C.focus);
    const topEdges = [...ties.values()].filter(e=>top5.has(e.s)||top5.has(e.t)).map(e=>[e.s,e.t,C.focus,1.4]);
    steps.push({title:'Rank brokers by cross-department ties', detail:`The top 5 people sit on ${via5} of ${ties.size} ties (${ties.size?pct(via5/ties.size):'0%'}).`, nodes:top.map(x=>x.pid), nodeColor:nc, edges:topEdges, labels:top.map(x=>x.pid), line:[3,4,5,6], legend:ona});
    const rows = top.map(x=>({name:N[x.pid].name, dept:deptShort(N[x.pid].dept), role:N[N[x.pid].role].name, ties:x.n, share:ties.size? x.n/ties.size : 0, _node:x.pid}));
    return {steps, cols:[{k:'name',l:'Person'},{k:'dept',l:'Department'},{k:'role',l:'Role'},{k:'ties',l:'Cross-dept. ties',t:'num'},{k:'share',l:'% of all ties',t:'pct'}], rows,
      foot:'A tie is a pair of people who collaborate. Each tie has two ends, so the % column does not add up to 100%. Collaboration data in production would come from aggregated Teams/e-mail metadata and needs works-council and data-protection approval.',
      summary:`<b>${ties.size}</b> ties link ${esc(A.name)} and ${esc(B.name)}. The top 5 brokers sit on <b>${ties.size?pct(via5/ties.size):'0%'}</b> of them; without them ${ties.size-via5} ties would remain. ${zeroA} of ${ma.ppl.length} people in ${esc(A.name)} have no tie to ${esc(B.name)}.`};
  }});

QUERIES.push({ id:'compliance', title:'Certification gaps', tag:'Compliance', params:[],
  question: () => `Who holds a role that requires a certification they don’t have, have let expire, or will lose within 30 days of 18 Nov 2026?`,
  advantage:['Low','A plain join with date logic. Keep this one in Snowflake; it is shown here because the same graph model answers it too.'],
  cypher: () => [
    `MATCH (c:Certification)<-[:REQUIRES_CERT]-(r:Role)<-[:HOLDS]-(p:Person)`,
    `OPTIONAL MATCH (p)-[cert:CERTIFIED]->(c)`,
    `WITH p, r, c, cert.expires AS expires,`,
    `     CASE WHEN cert IS NULL THEN 'Missing'`,
    `          WHEN cert.expires < date() THEN 'Expired'`,
    `          WHEN cert.expires < date() + duration('P30D') THEN 'Expires ≤ 30 days'`,
    `          ELSE 'Valid' END AS status`,
    `WHERE status <> 'Valid'`,
    `OPTIONAL MATCH (p)-[:MEMBER_OF]->(t:Team)`,
    `RETURN p.name, t.name, r.title, c.name, status, expires`,
    `ORDER BY status, expires`],
  sql: () => [
    `SELECT e.name, t.name AS team, r.title, c.name AS certification,`,
    `  CASE WHEN pc.person_id IS NULL THEN 'Missing'`,
    `       WHEN pc.expires < CURRENT_DATE THEN 'Expired'`,
    `       WHEN pc.expires < DATEADD(day, 30, CURRENT_DATE) THEN 'Expires <= 30 days'`,
    `  END AS status, pc.expires`,
    `FROM employee e JOIN role r ON r.role_id = e.role_id`,
    `JOIN role_certification rc ON rc.role_id = r.role_id`,
    `JOIN certification c ON c.cert_id = rc.cert_id`,
    `LEFT JOIN team t ON t.team_id = e.team_id`,
    `LEFT JOIN person_certification pc ON pc.person_id = e.person_id AND pc.cert_id = c.cert_id`,
    `WHERE status IS NOT NULL ORDER BY status, pc.expires;`],
  run(){
    const steps=[]; const certs = N.filter(n=>n.type==='Certification');
    steps.push({title:'Find certification nodes', detail:certs.map(c=>c.name).join(', ')+'.', nodes:certs.map(c=>c.id), labels:certs.map(c=>c.id), line:[0]});
    const rEdges=[], roles=[];
    for(const c of certs) for(const e of inn(c.id,'REQUIRES_CERT')){ rEdges.push([e.s,c.id,C.cert,1.2]); roles.push(e.s); }
    steps.push({title:'Roles ← REQUIRES_CERT', detail:`${new Set(roles).size} roles require at least one certification.`, nodes:roles, edges:rEdges, labels:[...new Set(roles)], line:[0]});
    const pairs=[]; const hEdges=[];
    for(const rid of new Set(roles)){ const need = out(rid,'REQUIRES_CERT').map(e=>e.t); for(const h of inn(rid,'HOLDS')){ hEdges.push([h.s,rid,C.muted,0.5]); for(const c of need) pairs.push({p:h.s, c, r:rid}); } }
    steps.push({title:'People ← HOLDS those roles', detail:`${new Set(pairs.map(x=>x.p)).size} people, ${pairs.length} person–certification requirements to check.`, nodes:[...new Set(pairs.map(x=>x.p))], edges:hEdges, line:[0], edgeAlpha:0.3, dimNodes:true});
    const issues=[]; const cEdges=[]; const nodeColor={};
    const rank={'Missing':0,'Expired':1,'Expires ≤ 30 days':2};
    for(const x of pairs){ const ce = out(x.p,'CERTIFIED').find(e=>e.t===x.c); let st='Valid';
      if(!ce) st='Missing'; else { const ms = Date.parse(ce.expires+'T00:00:00Z'); if(ms<TODAY) st='Expired'; else if(ms<TODAY+30*DAY) st='Expires ≤ 30 days'; }
      if(st==='Valid'){ cEdges.push([x.p,x.c,C.muted,0.4]); continue; }
      const col = st==='Expires ≤ 30 days'? C.warn : C.bad; cEdges.push([x.p,x.c,col,1.3, st==='Missing']);
      if(!nodeColor[x.p] || col===C.bad) nodeColor[x.p]=col;
      issues.push({name:N[x.p].name, team:N[x.p].team!=null? N[N[x.p].team].name : deptName(N[x.p].dept)+' leadership', role:N[x.r].name, cert:CERT_SHORT[N[x.c].key], status:{text:st, cls: col===C.bad?'bad':'warn'}, expires: ce? ce.expires : '—', _node:x.p, _r:rank[st]}); }
    issues.sort((a,b)=>a._r-b._r || (a.expires<b.expires?-1:1));
    steps.push({title:'Check CERTIFIED edges and expiry dates', detail:`Red = missing (dashed) or expired, amber = expires within 30 days; valid certifications stay grey.`, nodes:Object.keys(nodeColor).map(Number), nodeColor, edges:cEdges, labels:issues.filter(x=>x._r===0).slice(0,10).map(x=>x._node), line:[1,2,3,4,5,6,7], legend:'cert', edgeAlpha:0.7});
    steps.push({title:'Return flagged people with their team', detail:'One MEMBER_OF hop per flagged person.', nodes:[], line:[8,9,10]});
    const c = s=>issues.filter(x=>x.status.text===s).length;
    const byTeam={}; issues.forEach(x=>byTeam[x.team]=(byTeam[x.team]||0)+1); const worst=Object.entries(byTeam).sort((a,b)=>b[1]-a[1])[0];
    return {steps, cols:[{k:'name',l:'Person'},{k:'status',l:'Status',t:'pill'},{k:'cert',l:'Certification'},{k:'expires',l:'Expires'},{k:'team',l:'Team'},{k:'role',l:'Role'}], rows:issues,
      foot:'Reference date: 18 Nov 2026 (snapshot date of the synthetic data). One row per person and certification.',
      summary:`As of 18 Nov 2026, <b>${issues.length}</b> open items: <b>${c('Missing')}</b> missing, <b>${c('Expired')}</b> expired, <b>${c('Expires ≤ 30 days')}</b> expiring within 30 days.` + (worst? ` Most affected team: ${esc(worst[0])} (${worst[1]}).`:'')};
  }});

QUERIES.push({ id:'risk', title:'Skill concentration risk', tag:'Workforce planning', params:[],
  question: () => `Which skills do many positions need at level 3+, while only a handful of people hold them at expert level (4–5)?`,
  advantage:['Low','This is an aggregation, which belongs in Snowflake. The graph reuses the same model and lets you click from a risky skill straight to its few experts.'],
  cypher: () => [
    `MATCH (s:Skill)<-[req:REQUIRES]-(r:Role)<-[:HOLDS]-(holder:Person)`,
    `WHERE req.level >= 3`,
    `WITH s, count(DISTINCT r) AS roles, count(holder) AS positions`,
    `OPTIONAL MATCH (s)<-[h:HAS_SKILL]-(expert:Person) WHERE h.level >= 4`,
    `WITH s, roles, positions, count(expert) AS experts,`,
    `     sum(CASE WHEN h.source = 'Manager-validated' THEN 1 ELSE 0 END) AS validated`,
    `RETURN s.name, roles, positions, experts, validated,`,
    `  CASE WHEN experts <= 3 AND positions >= 5 THEN 'Critical'`,
    `       WHEN experts <= 6 OR experts * 10 < positions THEN 'Thin' ELSE 'OK' END AS risk`,
    `ORDER BY experts ASC`],
  sql: () => [
    `WITH demand AS (`,
    `  SELECT rr.skill_id, COUNT(DISTINCT rr.role_id) AS roles, COUNT(e.person_id) AS positions`,
    `  FROM role_requirement rr JOIN employee e ON e.role_id = rr.role_id WHERE rr.level >= 3 GROUP BY 1),`,
    `supply AS (`,
    `  SELECT skill_id, COUNT(*) AS experts, SUM(IFF(source = 'Manager-validated', 1, 0)) AS validated`,
    `  FROM person_skill WHERE level >= 4 GROUP BY 1)`,
    `SELECT s.name, d.roles, d.positions, COALESCE(sp.experts, 0) AS experts, sp.validated`,
    `FROM demand d JOIN skill s USING (skill_id) LEFT JOIN supply sp USING (skill_id)`,
    `ORDER BY experts;`],
  run(){
    const steps=[]; const skills=N.filter(n=>n.type==='Skill');
    steps.push({title:'Scan all Skill nodes', detail:`${skills.length} skills in the taxonomy.`, nodes:skills.map(s=>s.id), line:[0]});
    const dem=new Map(), rEdges=[], rNodes=new Set();
    for(const s of skills) for(const e of inn(s.id,'REQUIRES')){ if(e.level<3) continue; const hc=inn(e.s,'HOLDS').length; const d=dem.get(s.id)||{roles:0,pos:0}; d.roles++; d.pos+=hc; dem.set(s.id,d); rEdges.push([e.s,s.id,C.role,0.6]); rNodes.add(e.s); }
    steps.push({title:'Demand: Skill ← REQUIRES ← Role ← HOLDS', detail:`Count positions whose role requires each skill at level 3 or higher.`, nodes:[...rNodes], edges:rEdges, line:[0,1,2], edgeAlpha:0.4});
    const sup=new Map(), xEdges=[], xNodes=new Set();
    for(const s of skills){ const ex=inn(s.id,'HAS_SKILL').filter(h=>h.level>=4); sup.set(s.id, ex); for(const h of ex){ xEdges.push([h.s,s.id,C.person,0.5]); xNodes.add(h.s);} }
    steps.push({title:'Supply: Skill ← HAS_SKILL {level ≥ 4}', detail:`${xEdges.length} expert-level skill edges held by ${xNodes.size} people.`, nodes:[...xNodes], edges:xEdges, line:[3,4,5], edgeAlpha:0.25, dimNodes:true});
    const rows=[]; const nodeColor={}; const crit=[]; const critExperts=[]; const ce=[];
    for(const s of skills){ const d=dem.get(s.id); if(!d) continue; const ex=sup.get(s.id); const n=ex.length; const val=ex.filter(h=>h.source==='Manager-validated').length;
      const risk = (n<=3 && d.pos>=5) ? 'Critical' : (n<=6 || n*10<d.pos) ? 'Thin' : 'OK';
      nodeColor[s.id] = risk==='Critical'?C.bad: risk==='Thin'?C.warn:C.ok;
      if(risk==='Critical'){ crit.push(s.id); for(const h of ex){ critExperts.push(h.s); ce.push([h.s,s.id,C.bad,1.6]); } }
      rows.push({skill:s.name, cat:s.cat, positions:d.pos, experts:n, validated:val, risk:{text:risk, cls: risk==='Critical'?'bad':risk==='Thin'?'warn':'ok'}, _node:s.id, _o: (risk==='Critical'?0:risk==='Thin'?1:2)}); }
    rows.sort((a,b)=>a._o-b._o || a.experts-b.experts || b.positions-a.positions);
    steps.push({title:'Compare supply with demand', detail:`${crit.length} critical skills (≤ 3 experts), ${rows.filter(r=>r._o===1).length} thin. Experts behind the critical skills are labelled.`, nodes:[...Object.keys(nodeColor).map(Number), ...critExperts], nodeColor, edges:ce, labels:[...crit, ...critExperts], line:[6,7,8,9], legend:'risk'});
    return {steps, cols:[{k:'skill',l:'Skill'},{k:'risk',l:'Risk',t:'pill'},{k:'experts',l:'Experts',t:'num'},{k:'validated',l:'Manager-validated',t:'num'},{k:'positions',l:'Positions needing level 3+',t:'num'},{k:'cat',l:'Category'}], rows,
      foot:'Experts = people at level 4–5, from any evidence source. Risk rule (demo assumption): critical = ≤ 3 experts and ≥ 5 positions; thin = ≤ 6 experts or fewer than 1 expert per 10 positions.',
      summary:`<b>${crit.length}</b> skills are single points of failure: ${rows.filter(r=>r._o===0).slice(0,4).map(r=>esc(r.skill)).join(', ')}${crit.length>4?' and more':''}. Click a row to locate a skill on the graph.`};
  }});

// neighbourhood query, used when someone clicks a node
const EGO = { id:'ego', title:'Neighbourhood', tag:'Exploration', params:[],
  question: P => `What is ${N[P.node].name} connected to?`,
  advantage:['Medium','Schema-free exploration: one pattern returns every relationship type. In SQL you would query each relationship table separately and UNION the results.'],
  cypher: P => [
    `MATCH (n:${N[P.node].type} {${N[P.node].type==='Role'?'title':'name'}: ${q(N[P.node].name)}})-[r]-(m)`,
    `RETURN type(r) AS relationship, labels(m)[0] AS neighbour, count(*) AS n,`,
    `       collect(coalesce(m.name, m.title))[0..3] AS examples`,
    `ORDER BY n DESC`],
  sql: P => [
    `-- one query per relationship table, e.g. for a person:`,
    `SELECT 'HAS_SKILL', COUNT(*) FROM person_skill WHERE person_id = :id`,
    `UNION ALL SELECT 'REPORTS_TO', COUNT(*) FROM employee WHERE person_id = :id AND manager_id IS NOT NULL`,
    `UNION ALL SELECT 'COMPLETED', COUNT(*) FROM completion WHERE person_id = :id`,
    `UNION ALL SELECT 'COLLABORATES_WITH', COUNT(*) FROM collaboration WHERE :id IN (person_a, person_b)`,
    `UNION ALL ... -- and so on for every table that references the entity`],
  run(P){
    const n=N[P.node], steps=[];
    steps.push({title:'Find the node', detail:`${n.type}: ${n.name}.`, nodes:[n.id], labels:[n.id], line:[0]});
    const all = both(n.id).filter(x=>x.e.type!=='MOVED_TO' || true);
    const edges=[], nodes=[], groups={};
    for(const {e,o} of all){ const out1 = e.s===n.id; const key = (e.type==='COLLABORATES_WITH'?'↔ ':out1?'→ ':'← ')+e.type+' · '+N[o].type; (groups[key]=groups[key]||[]).push(o); edges.push([n.id,o,TYPE_COLOR[N[o].type],0.8]); nodes.push(o); }
    const big = edges.length>120;
    steps.push({title:'Expand all relationships', detail:`${all.length} relationships of ${Object.keys(groups).length} kinds.`, nodes, edges, labels: big? [] : nodes, line:[0,1,2,3], edgeAlpha: big?0.35:0.8});
    const rows = Object.entries(groups).sort((a,b)=>b[1].length-a[1].length).map(([k,ids])=>({rel:k, n:ids.length, ex: ids.slice(0,3).map(i=>N[i].name).join(', ') + (ids.length>3?' …':''), _node: ids[0]}));
    return {steps, cols:[{k:'rel',l:'Relationship'},{k:'n',l:'Count',t:'num'},{k:'ex',l:'Examples'}], rows, summary: describe(n)};
  }};

function describe(n){
  if(n.type==='Person'){ const r=N[n.role]; return `<b>${esc(n.name)}</b> · ${esc(r.name)} · ${esc(deptName(n.dept))}${n.team!=null?' · '+esc(N[n.team].name):''} · ${n.tenure} yrs tenure · performance ${n.perf}/5.`; }
  if(n.type==='Role') return `<b>${esc(n.name)}</b> · ${esc(deptName(n.dept))} · seniority ${n.sen} · ${n.hc} incumbents.`;
  if(n.type==='Skill') return `<b>${esc(n.name)}</b> · ${esc(n.cat)} · held by ${n.holders} people.`;
  if(n.type==='Course') return `<b>${esc(n.name)}</b> · ${n.hours} h · ${esc(n.provider)} · teaches up to level ${n.upTo}.`;
  if(n.type==='Team') return `<b>${esc(n.name)}</b> · ${esc(deptName(n.dept))} · ${n.size} members.`;
  if(n.type==='Department') return `<b>${esc(n.name)}</b> · ${n.size} people.`;
  return `<b>${esc(n.name)}</b> · ${n.type}.`;
}

function execute(query, P){
  TR = {edges:0, nodes:new Set()};
  const t0 = (typeof performance!=='undefined'?performance:Date).now();
  const res = query.run(P);
  res.ms = (typeof performance!=='undefined'?performance:Date).now() - t0;
  res.trEdges = TR.edges; res.trNodes = TR.nodes.size; TR = null;
  return res;
}

// defaults that tell a coherent story
const techs = people.filter(p=>N[p.role].key==='OPT');
// default story: a technician with some data skills, a real gap to Operations Data Analyst, and a career history
const mdaReq = sOut(roleId.ODA,'REQUIRES');
const fitTo = p => { let n=0,d=0; for(const e of mdaReq){ n+=Math.min(p.sk[e.t]||0,e.level); d+=e.level; } return n/d; };
const defPerson = (techs.find(p=>p.history.length && (p.sk[skillId.SQL]||0)>=2 && fitTo(p)>=0.55 && fitTo(p)<=0.8) || techs.find(p=>fitTo(p)>=0.55 && fitTo(p)<=0.8) || techs[0]).id;

const counts = {}; for(const n of N) counts[n.type]=(counts[n.type]||0)+1;
const relCounts = {}; for(const e of E) relCounts[e.type]=(relCounts[e.type]||0)+1;

return { N, E, C, TYPE_COLOR, DEPTS, deptByKey, deptNode, heads, roleId, skillId, people, QUERIES, EGO, execute, describe, esc, pct, deptName,
  defaults:{ person:defPerson, role:roleId.ODA, leader:heads.RC, deptA:deptNode.ENG, deptB:deptNode.OPS }, counts, relCounts, ceo:ceo.id };
})();
if (typeof module !== 'undefined') module.exports = PG;
