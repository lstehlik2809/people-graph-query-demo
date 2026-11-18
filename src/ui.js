(function(){
'use strict';
const {N, E, C, TYPE_COLOR, DEPTS, deptByKey, QUERIES, EGO, execute, describe, esc, pct, deptName} = PG;
const $ = id => document.getElementById(id);
const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const ease = t => 1 - Math.pow(1-t, 3);
const fmt = n => n.toLocaleString('en');
const BG = '#0c1320';

const S = { qid:'gap', params:Object.assign({}, PG.defaults), lang:'cypher', res:null, q:null, P:null, step:-1, t:1, playing:false, done:false, speed:1, hover:null, ego:null, pulse:null, activeRow:-1 };
const qById = id => id==='ego' ? EGO : QUERIES.find(q=>q.id===id);

// ---------- header numbers ----------
{ const c = PG.counts; const rel = E.length;
  $('kpis').innerHTML = [['People',c.Person],['Teams',c.Team],['Roles',c.Role],['Skills',c.Skill],['Courses',c.Course],['Relationships',rel]]
    .map(([l,v])=>`<div class="kpi"><b>${fmt(v)}</b><span>${l}</span></div>`).join(''); }

// ---------- query list ----------
function renderQList(){
  $('qlist').innerHTML = QUERIES.map((q,i)=>`<button class="q${S.qid===q.id?' on':''}" data-q="${q.id}" aria-pressed="${S.qid===q.id}"><span class="qn">${i+1}</span><span class="qt">${esc(q.title)}</span><span class="qtag">${esc(q.tag)}</span></button>`).join('');
}
$('qlist').addEventListener('click', e=>{ const b=e.target.closest('button[data-q]'); if(!b) return; S.qid=b.dataset.q; S.ego=null; renderQList(); renderParams(); run('play'); });

// ---------- parameters ----------
const nameToId = new Map(PG.people.map(p=>[p.name.toLowerCase(), p.id]));
$('peopleList').innerHTML = PG.people.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${esc(p.name)}">${esc(N[p.role].name)} · ${esc(deptName(p.dept))}</option>`).join('');
const roleOptions = () => [...DEPTS, deptByKey.EXEC].map(d=>{ const rs=N.filter(n=>n.type==='Role'&&n.dept===d.key).sort((a,b)=>a.sen-b.sen); return `<optgroup label="${esc(d.name)}">${rs.map(r=>`<option value="${r.id}"${r.id===S.params.role?' selected':''}>${esc(r.name)}</option>`).join('')}</optgroup>`; }).join('');
const leaderOptions = () => { const headsG = `<optgroup label="Department heads">${DEPTS.map(d=>{const id=PG.heads[d.key]; return `<option value="${id}"${id===S.params.leader?' selected':''}>${esc(N[id].name)} · ${esc(N[N[id].role].name)}</option>`;}).join('')}</optgroup>`;
  const leads = DEPTS.map(d=>{ const ts=N.filter(n=>n.type==='Team'&&n.dept===d.key); return `<optgroup label="Team leads · ${esc(d.name)}">${ts.map(t=>`<option value="${t.lead}"${t.lead===S.params.leader?' selected':''}>${esc(N[t.lead].name)} · ${esc(t.name)}</option>`).join('')}</optgroup>`; }).join('');
  return headsG + leads; };
const deptOptions = sel => DEPTS.map(d=>`<option value="${PG.deptNode[d.key]}"${PG.deptNode[d.key]===sel?' selected':''}>${esc(d.name)}</option>`).join('');
const personHint = id => { const p=N[id]; return `${esc(N[p.role].name)} · ${esc(deptName(p.dept))} · ${esc(p.loc)} · ${p.tenure} yrs`; };

function renderParams(){
  const q = qById(S.qid); const box = $('params');
  if(S.qid==='ego'){
    const n = N[S.ego];
    const acts = [];
    if(n.type==='Person'){ acts.push(['gap','Skills gap','person'],['career','Career paths','person'],['learn','Learning path','person']); if(E.some(e=>e.type==='REPORTS_TO'&&e.t===n.id) && n.id!==PG.ceo) acts.push(['succession','Succession bench','leader']); }
    if(n.type==='Role' && n.dept!=='EXEC') acts.push(['talent','Internal talent','role'],['gap','Skills gap (for '+N[S.params.person].name.split(' ')[0]+')','role']);
    if(n.type==='Department') acts.push(['ona','Who bridges to '+N[S.params.deptA===n.id?S.params.deptB:S.params.deptA].name,'deptA']);
    box.innerHTML = `<p class="question">${esc(q.question({node:S.ego}))}</p>` + (acts.length? `<div class="follow"><span>Ask about this ${n.type.toLowerCase()}:</span>${acts.map(a=>`<button class="chip" data-follow="${a[0]}" data-param="${a[2]}">${esc(a[1])}</button>`).join('')}</div>` : '<p class="muted">Click a person, role or department to get follow-up questions.</p>');
    return;
  }
  const P = S.params; const parts = [`<p class="question">${esc(q.question(P))}</p>`];
  for(const k of q.params){
    if(k==='person') parts.push(`<div class="field"><label for="p-person">Employee</label><div class="row"><input id="p-person" list="peopleList" value="${esc(N[P.person].name)}" autocomplete="off" spellcheck="false"><button class="btn small" id="p-random" type="button">Random</button></div><div class="hint" id="p-person-hint">${personHint(P.person)}</div></div>`);
    if(k==='role') parts.push(`<div class="field"><label for="p-role">Target role</label><select id="p-role">${roleOptions()}</select></div>`);
    if(k==='leader') parts.push(`<div class="field"><label for="p-leader">Leader</label><select id="p-leader">${leaderOptions()}</select></div>`);
    if(k==='deptA') parts.push(`<div class="field"><label for="p-deptA">Department A</label><select id="p-deptA">${deptOptions(P.deptA)}</select></div>`);
    if(k==='deptB') parts.push(`<div class="field"><label for="p-deptB">Department B</label><select id="p-deptB">${deptOptions(P.deptB)}</select></div>`);
  }
  if(!q.params.length) parts.push(`<p class="muted">No parameters: this question scans the whole graph.</p>`);
  box.innerHTML = parts.join('');
  const pin = $('p-person');
  if(pin){ pin.addEventListener('change', ()=>{ const id = nameToId.get(pin.value.trim().toLowerCase()); const hint=$('p-person-hint');
      if(id===undefined){ hint.innerHTML = 'No employee with that name. Pick one from the list.'; hint.classList.add('err'); return; }
      hint.classList.remove('err'); S.params.person=id; renderParams(); run('play'); });
    $('p-random').addEventListener('click', ()=>{ S.params.person = PG.people[1+Math.floor(Math.random()*(PG.people.length-1))].id; renderParams(); run('play'); }); }
  for(const k of ['role','leader','deptA','deptB']){ const el=$('p-'+k); if(el) el.addEventListener('change', ()=>{ S.params[k]=Number(el.value); renderParams(); run('play'); }); }
}
$('params').addEventListener('click', e=>{ const b=e.target.closest('button[data-follow]'); if(!b) return; const n=N[S.ego];
  if(b.dataset.param==='deptA'){ if(S.params.deptB===n.id) S.params.deptB=S.params.deptA; S.params.deptA=n.id; } else S.params[b.dataset.param]=n.id;
  S.qid=b.dataset.follow; S.ego=null; renderQList(); renderParams(); run('play'); });

// ---------- code panel ----------
const CY_KW = /\b(OPTIONAL MATCH|MATCH|WHERE|WITH|RETURN|ORDER BY|LIMIT|CASE|WHEN|THEN|ELSE|END|AND|OR|NOT|AS|UNWIND|DISTINCT|IS NULL|IS NOT NULL|NULL|UNION ALL|UNION|DESC|ASC|CALL|IN|SELECT|FROM|LEFT JOIN|CROSS JOIN|JOIN|ON|GROUP BY|HAVING|USING|RECURSIVE|CREATE TEMP TABLE|OVER|PARTITION BY|COALESCE|LEAST|SUM|COUNT|MAX|MIN|LEAD|IFF|DATEADD|CURRENT_DATE)\b/g;
function hlLine(line){
  let comment = '';
  const ci = line.search(/(\/\/|-- )/);
  if(ci>=0 && !/"[^"]*$/.test(line.slice(0,ci))){ comment = line.slice(ci); line = line.slice(0,ci); }
  const parts = line.split(/("[^"]*"|'[^']*')/);
  let html = parts.map((p,i)=>{ if(i%2) return `<span class="str">${esc(p)}</span>`;
    let h = esc(p);
    h = h.replace(/:(Person|Role|Skill|Course|Certification|Team|Department)\b/g, (m,l)=>`<span class="lb" data-t="${l.toLowerCase()}">:${l}</span>`);
    h = h.replace(/:([A-Z][A-Z_]{2,}[A-Z])(?![a-z])/g, '<span class="rt">:$1</span>');
    h = h.replace(CY_KW, '<span class="kw">$1</span>');
    h = h.replace(/\b(coalesce|count|sum|min|max|collect|reduce|length|relationships|labels|type|date|duration|toFloat|gds\.betweenness\.stream)\(/g, '<span class="fn">$1</span>(');
    return h; }).join('');
  if(comment) html += `<span class="cm">${esc(comment)}</span>`;
  return html;
}
function renderCode(){
  if(!S.q) return;
  const lines = S.lang==='cypher' ? S.q.cypher(S.P) : S.q.sql(S.P);
  $('code').innerHTML = lines.map((l,i)=>`<span class="ln" data-i="${i}">${hlLine(l)}</span>`).join('');
  const [lvl, note] = S.q.advantage;
  $('verdict').innerHTML = `<span class="adv" data-l="${lvl.split('–')[0].toLowerCase()}">Graph advantage over SQL: ${esc(lvl)}</span><span>${esc(note)} <i>(Author’s assessment, not a benchmark.)</i></span>`;
  highlightCode();
}
function highlightCode(){
  const on = new Set(S.lang==='cypher' && S.res && S.step>=0 ? (S.res.steps[S.step].line||[]) : []);
  let first=null;
  for(const el of $('code').querySelectorAll('.ln')){ const is = on.has(Number(el.dataset.i)); el.classList.toggle('on', is); if(is && !first) first=el; }
  if(first){ const box=$('code'); const top=first.offsetTop - box.offsetTop; if(top < box.scrollTop || top > box.scrollTop + box.clientHeight - 30) box.scrollTop = Math.max(0, top - 20); }
}
for(const b of document.querySelectorAll('.tab')) b.addEventListener('click', ()=>{ S.lang=b.dataset.lang; document.querySelectorAll('.tab').forEach(x=>{ x.classList.toggle('on', x===b); x.setAttribute('aria-selected', x===b); }); renderCode(); });

// ---------- running a query ----------
function run(mode){
  S.q = qById(S.qid); S.P = S.qid==='ego' ? {node:S.ego} : Object.assign({}, S.params);
  S.res = execute(S.q, S.P); S.step=-1; S.done=false; S.activeRow=-1; S.pulse=null; S.allRows=false;
  renderCode(); renderStats(); renderTrace(); renderResults(); updateButtons();
  if(mode==='instant' || (reduced && mode==='play')){ S.playing = mode==='play'; S.step=S.res.steps.length-1; S.t=1; stepChanged(); finish(); }
  else if(mode==='step'){ S.playing=false; advance(); }
  else { S.playing=true; advance(); }
}
function stepDur(){ const s=S.res.steps[S.step]; const n=(s.edges||[]).length; return (n>300?1300:950)/S.speed; }
function advance(){
  if(!S.res) return;
  if(S.step >= S.res.steps.length-1){ if(!S.done) finish(); return; }
  S.step++; S.t = reduced ? 1 : 0; S.stepStart = performance.now(); stepChanged(); updateButtons();
}
function stepChanged(){ buildHL(); renderTrace(); highlightCode(); renderCaption(); renderLegend(); measureOverlays(); fitToHL(); dirty=true; }
function finish(){ S.done=true; S.playing=false; renderTrace(); renderResults(); renderCaption(); updateButtons(); measureOverlays(); dirty=true; }
function updateButtons(){ const atEnd = S.res && S.step>=S.res.steps.length-1 && S.done; $('btnStep').textContent = (!S.res || atEnd) ? 'Step through' : 'Next step'; $('btnSkip').disabled = !S.res || atEnd; }
$('btnRun').addEventListener('click', ()=>run('play'));
$('btnStep').addEventListener('click', ()=>{ if(!S.res || S.done) run('step'); else { S.playing=false; if(S.t<1){ S.t=1; } advance(); if(S.step===S.res.steps.length-1) setTimeout(()=>{ if(!S.done && S.t>=1) finish(); }, 0); } updateButtons(); });
$('btnSkip').addEventListener('click', ()=>{ if(!S.res) return; S.playing=false; S.step=S.res.steps.length-1; S.t=1; stepChanged(); finish(); });
$('speed').addEventListener('change', e=>{ S.speed=Number(e.target.value); });

// ---------- trace, stats, results ----------
function renderStats(){
  const r=S.res; const total=N.length;
  $('stats').innerHTML = `<div><b>${fmt(r.trEdges)}</b><span>relationships traversed</span></div><div><b>${fmt(r.trNodes)}</b><span>of ${fmt(total)} nodes touched (${pct(r.trNodes/total)})</span></div><div><b>${r.ms<1?'<1':r.ms.toFixed(0)} ms</b><span>to run in your browser</span></div>`;
}
function renderTrace(){
  if(!S.res){ $('trace').innerHTML=''; return; }
  $('trace').innerHTML = S.res.steps.map((s,i)=>{ const st = i<S.step || (i===S.step && S.done) ? 'done' : i===S.step ? 'cur' : 'todo'; const ne=(s.edges||[]).length;
    return `<li class="${st}"><button type="button" data-i="${i}"><span class="sn">${i+1}</span><span class="sb"><span class="st">${esc(s.title)}</span>${ne?`<span class="se">${fmt(ne)} relationship${ne===1?'':'s'} drawn</span>`:''}<span class="sd">${esc(s.detail)}</span></span></button></li>`; }).join('');
}
$('trace').addEventListener('click', e=>{ const b=e.target.closest('button[data-i]'); if(!b||!S.res) return; S.playing=false; S.step=Number(b.dataset.i); S.t=1; stepChanged(); if(S.step===S.res.steps.length-1) finish(); else { S.done=false; renderTrace(); renderResults(); updateButtons(); } });

function cell(c, v){
  if(c.t==='pct') return `<td class="pc"><span class="bar"><i style="width:${Math.round(v*100)}%"></i></span>${pct(v)}</td>`;
  if(c.t==='num') return `<td class="num">${esc(v)}</td>`;
  if(c.t==='pill') return `<td><span class="pill ${v.cls}">${esc(v.text)}</span></td>`;
  if(c.t==='pips'){ let h=''; for(let i=1;i<=5;i++){ const filled=i<=v.have; const need=i<=v.req; const cls = filled ? (v.have>=v.req?'ok':'warn') : need ? 'need' : 'off'; h+=`<i class="${cls}"></i>`; } return `<td><span class="pips" title="has ${v.have}, requires ${v.req}">${h}</span> <span class="muted">${v.have}/${v.req}</span></td>`; }
  return `<td>${esc(v)}</td>`;
}
function renderResults(){
  const tb=$('results'), sum=$('summary');
  if(!S.res){ tb.innerHTML=''; sum.innerHTML=''; $('resFoot').innerHTML=''; return; }
  if(!S.done){ sum.innerHTML = `<span class="muted">The result appears when the last step finishes. Use “Skip to result” to jump ahead.</span>`; tb.innerHTML=''; $('resCount').textContent=''; $('resFoot').innerHTML=''; return; }
  const r=S.res; sum.innerHTML = r.summary;
  const rows = S.allRows ? r.rows : r.rows.slice(0,40);
  $('resCount').textContent = r.rows.length ? (r.rows.length>rows.length? `${rows.length} of ${r.rows.length} rows` : `${r.rows.length} row${r.rows.length===1?'':'s'}`) : '';
  $('resFoot').innerHTML = (r.rows.length>rows.length ? `<button class="btn small" type="button" id="showAll">Show all ${r.rows.length} rows</button>` : '') + (r.foot ? `<p>${esc(r.foot)}</p>` : '');
  const sa=$('showAll'); if(sa) sa.addEventListener('click', ()=>{ S.allRows=true; renderResults(); });
  tb.innerHTML = r.rows.length ? `<thead><tr>${r.cols.map(c=>`<th${c.t==='num'||c.t==='pct'?' class="num"':''}>${esc(c.l)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,i)=>`<tr data-i="${i}" tabindex="0"${i===S.activeRow?' class="on"':''}>${r.cols.map(c=>cell(c,row[c.k])).join('')}</tr>`).join('')}</tbody>` : '';
}
function focusRow(i){ const row=S.res.rows[i]; if(!row || row._node==null) return; S.activeRow=i; for(const tr of $('results').querySelectorAll('tr[data-i]')) tr.classList.toggle('on', Number(tr.dataset.i)===i); const n=N[row._node]; S.pulse={id:n.id, t0:performance.now()}; flyTo(n.x, n.y, Math.max(cam.k, 2.4)); dirty=true; }
$('results').addEventListener('click', e=>{ const tr=e.target.closest('tr[data-i]'); if(tr) focusRow(Number(tr.dataset.i)); });
$('results').addEventListener('keydown', e=>{ if(e.key==='Enter'){ const tr=e.target.closest('tr[data-i]'); if(tr) focusRow(Number(tr.dataset.i)); } });

function renderCaption(){
  const cap=$('caption');
  if(!S.res || S.step<0){ cap.hidden=true; return; }
  const s=S.res.steps[S.step]; cap.hidden=false;
  cap.innerHTML = `<span class="cstep">Step ${S.step+1} of ${S.res.steps.length}${S.done?' · done':''}</span><b>${esc(s.title)}</b><span class="cdet">${esc(s.detail)}</span>`;
}

// ---------- legend ----------
const SHAPE_SVG = { Person:'<circle cx="7" cy="7" r="4"/>', Role:'<rect x="3" y="3" width="8" height="8"/>', Skill:'<circle cx="7" cy="7" r="5.5"/>', Course:'<path d="M7 1.5 12.5 7 7 12.5 1.5 7z"/>', Certification:'<path d="M7 1.5l4.8 2.75v5.5L7 12.5 2.2 9.75v-5.5z"/>', Team:'<circle cx="7" cy="7" r="4.5" fill="none" stroke-width="1.6"/>' };
const ico = (t,col) => `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="${col}" stroke="${col}">${SHAPE_SVG[t]}</svg>`;
const LEGENDS = { gap:[[C.ok,'Meets required level'],[C.warn,'Below required level'],[C.bad,'No evidence']], ready:[[C.ok,'Ready now'],[C.warn,'Ready in 1–2 years']], cert:[[C.bad,'Expired, or missing (dashed)'],[C.warn,'Expires ≤ 30 days'],[C.muted,'Valid']], risk:[[C.bad,'Critical'],[C.warn,'Thin'],[C.ok,'OK']] };
function renderLegend(){
  const types = ['Person','Role','Skill','Course','Certification','Team'].map(t=>`<span>${ico(t, TYPE_COLOR[t])}${t}</span>`).join('');
  let extra = '';
  const hl = S.res && S.step>=0;
  if(!hl) extra = `<div class="lg-depts"><span>Each cluster is one department; its teams are the small rings.</span></div>`;
  else { let key=null; for(let i=0;i<=S.step;i++) if(S.res.steps[i].legend) key=S.res.steps[i].legend; const items = Array.isArray(key) ? key : key ? LEGENDS[key] : null;
    if(items) extra = `<div class="lg-depts"><span class="lg-h">Colour in this query:</span>${items.map(([c,l])=>`<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>`; }
  $('legend').innerHTML = `<div class="lg-types">${types}</div>${extra}`;
}

// ---------- canvas renderer ----------
const cv=$('cv'), ctx=cv.getContext('2d');
let W=1, H=1, dpr=1, dirty=true;
const cam={x:0,y:0,k:0.5}; let camAnim=null;
function resize(){ measureOverlays(); const r=cv.parentElement.getBoundingClientRect(); W=Math.max(1,r.width); H=Math.max(1,r.height); dpr=window.devicePixelRatio||1; cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); dirty=true; }
function fitBox(x0,y0,x1,y1,animate,maxK){
  const small = W<600; const lg=$('legend').getBoundingClientRect(), cvr=cv.getBoundingClientRect(); const pl=small?16:36, pr=small?16:36, pt=Math.max(small?70:84, lg.bottom-cvr.top+18), pb = (S.res && S.step>=0) ? (small?120:112) : 40;
  const w=Math.max(x1-x0,220), h=Math.max(y1-y0,220); const k=clamp(Math.min((W-pl-pr)/w,(H-pt-pb)/h), 0.15, maxK||2.6);
  const scx=(pl+W-pr)/2, scy=(pt+H-pb)/2; const cx=(x0+x1)/2, cy=(y0+y1)/2;
  setCam(cx-(scx-W/2)/k, cy-(scy-H/2)/k, k, animate); }
function setCam(x,y,k,animate){ if(animate && !reduced){ camAnim={from:{x:cam.x,y:cam.y,k:cam.k}, to:{x,y,k}, t0:performance.now(), dur:650}; } else { cam.x=x; cam.y=y; cam.k=k; camAnim=null; } dirty=true; }
function flyTo(x,y,k){ setCam(x,y,clamp(k,0.15,8),true); }
let worldBox=[0,0,0,0];
{ let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const n of N){ x0=Math.min(x0,n.x); y0=Math.min(y0,n.y); x1=Math.max(x1,n.x); y1=Math.max(y1,n.y); } worldBox=[x0-20,y0-20,x1+20,y1+20]; }
const fitAll = animate => fitBox(...worldBox, animate);
function fitToHL(){ if(!HL) return; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9, c=0; for(const id of HL.nodes.keys()){ const n=N[id]; x0=Math.min(x0,n.x); y0=Math.min(y0,n.y); x1=Math.max(x1,n.x); y1=Math.max(y1,n.y); c++; } if(c) fitBox(x0,y0,x1,y1,true); }

let OVERLAYS=[];
function measureOverlays(){ const c=cv.getBoundingClientRect(); OVERLAYS=['legend','zoom-box','caption'].map(id=>$(id)).filter(el=>el && !el.hidden).map(el=>{ const r=el.getBoundingClientRect(); return [r.left-c.left-4, r.top-c.top-4, r.width+8, r.height+8]; }); }
let HL=null;
function buildHL(){
  if(!S.res || S.step<0){ HL=null; return; }
  const nodes=new Map(), edges=[], labels=[];
  for(let i=0;i<=S.step;i++){ const s=S.res.steps[i];
    for(const id of s.nodes){ const col=(s.nodeColor&&s.nodeColor[id]) || (nodes.has(id)? nodes.get(id).color : TYPE_COLOR[N[id].type]); const prev=nodes.get(id); nodes.set(id,{color:col, step: prev? prev.step : i, dim: !!s.dimNodes && !(prev && !prev.dim)}); }
    for(const e of (s.edges||[])) edges.push({a:e[0], b:e[1], color:e[2]||C.muted, w:e[3]||1, dash:!!e[4], step:i, alpha:s.edgeAlpha||0.85});
    for(const id of (s.labels||[])) labels.push({id, step:i});
    if(s.nodeColor) for(const id in s.nodeColor){ const n=nodes.get(Number(id)); if(n){ n.color=s.nodeColor[id]; n.dim=false; } }
  }
  // newest labels first, so they win collisions
  labels.sort((a,b)=>b.step-a.step);
  HL={nodes, edges, labels};
}

const baseColor = n => TYPE_COLOR[n.type];
function radius(n){ const k=cam.k; switch(n.type){
  case 'Person': return n.id===PG.ceo ? clamp(4*k,2.5,9) : clamp(2.1*k,1.2,6.5);
  case 'Role': return clamp(3.9*k,2.4,10); case 'Skill': return clamp(4.8*k,2.8,12); case 'Course': return clamp(3.1*k,1.8,8);
  case 'Certification': return clamp(6*k,3.5,14); case 'Team': return clamp(2.6*k,1.4,7); default: return clamp(8*k,4,20); } }
function shape(n, x, y, r){
  ctx.beginPath();
  switch(n.type){
    case 'Role': ctx.rect(x-r*0.9, y-r*0.9, r*1.8, r*1.8); ctx.fill(); break;
    case 'Course': ctx.moveTo(x,y-r); ctx.lineTo(x+r,y); ctx.lineTo(x,y+r); ctx.lineTo(x-r,y); ctx.closePath(); ctx.fill(); break;
    case 'Certification': for(let i=0;i<6;i++){ const a=Math.PI/6+i*Math.PI/3; i?ctx.lineTo(x+r*Math.cos(a),y+r*Math.sin(a)):ctx.moveTo(x+r*Math.cos(a),y+r*Math.sin(a)); } ctx.closePath(); ctx.fill(); break;
    case 'Team': case 'Department': ctx.arc(x,y,r,0,Math.PI*2); ctx.lineWidth = n.type==='Team'?1:1.4; ctx.stroke(); break;
    default: ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
}
const REPORTS = E.filter(e=>e.type==='REPORTS_TO'), REQS = E.filter(e=>e.type==='REQUIRES'), MOVES = E.filter(e=>e.type==='MOVED_TO');

function draw(now){
  const k=cam.k; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.fillStyle=BG; ctx.fillRect(0,0,W,H);
  for(const n of N){ n.sx=(n.x-cam.x)*k+W/2; n.sy=(n.y-cam.y)*k+H/2; }
  const hl = HL;
  // orientation rings
  ctx.globalAlpha = hl?0.04:0.07; ctx.strokeStyle='#9fb2d0'; ctx.lineWidth=1; ctx.setLineDash([2,6]);
  for(const r of [150, 690]){ ctx.beginPath(); ctx.arc((0-cam.x)*k+W/2, (0-cam.y)*k+H/2, r*k, 0, Math.PI*2); ctx.stroke(); }
  ctx.setLineDash([]);
  // base edges
  const line = (arr, col, al) => { ctx.globalAlpha=al; ctx.strokeStyle=col; ctx.beginPath(); for(const e of arr){ const a=N[e.s], b=N[e.t]; ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy);} ctx.stroke(); };
  ctx.lineWidth=1;
  line(REPORTS, '#9aa6bd', hl?0.03:0.11);
  if(!hl){ line(REQS, C.role, 0.07); }
  // base nodes
  for(const n of N){ if(hl && hl.nodes.has(n.id)) continue; const r=radius(n); ctx.globalAlpha = hl ? (n.type==='Person'?0.16:0.22) : (n.type==='Team'?0.45:n.type==='Department'?0.5:0.92); const col = hl ? '#55627a' : baseColor(n); ctx.fillStyle=col; ctx.strokeStyle=col; shape(n, n.sx, n.sy, r); }
  if(hl){
    for(const e of hl.edges){ const a=N[e.a], b=N[e.b]; let f=1; if(e.step===S.step) f=ease(clamp(S.t/0.7,0,1)); if(f<=0) continue;
      ctx.globalAlpha = e.alpha; ctx.strokeStyle=e.color; ctx.lineWidth = Math.max(0.6, e.w*clamp(0.55+k*0.45,0.7,2));
      if(e.dash) ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(a.sx+(b.sx-a.sx)*f, a.sy+(b.sy-a.sy)*f); ctx.stroke();
      if(e.dash) ctx.setLineDash([]);
      if(e.step===S.step && f<1 && f>0.02 && hl.edges.length<400){ ctx.globalAlpha=0.9; ctx.fillStyle=e.color; ctx.beginPath(); ctx.arc(a.sx+(b.sx-a.sx)*f, a.sy+(b.sy-a.sy)*f, 1.8, 0, Math.PI*2); ctx.fill(); } }
    for(const [id,h] of hl.nodes){ const n=N[id]; let al=1; if(h.step===S.step) al=clamp((S.t-0.3)/0.4,0,1); if(al<=0) continue; const r=radius(n)*(h.dim?1:1.25);
      ctx.fillStyle=h.color; ctx.strokeStyle=h.color;
      if(!h.dim && n.type!=='Team' && n.type!=='Department'){ ctx.globalAlpha=al*0.55; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(n.sx,n.sy,r+3,0,Math.PI*2); ctx.stroke(); }
      ctx.globalAlpha = al*(h.dim?0.6:1); shape(n, n.sx, n.sy, r); }
  }
  // pulse on focused node
  if(S.pulse){ const n=N[S.pulse.id]; const p=((now-S.pulse.t0)%1400)/1400; ctx.globalAlpha=1-p; ctx.strokeStyle='#ffffff'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(n.sx,n.sy,radius(n)+4+p*18,0,Math.PI*2); ctx.stroke(); }
  if(S.hover!=null){ const n=N[S.hover]; ctx.globalAlpha=1; ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(n.sx,n.sy,radius(n)+3,0,Math.PI*2); ctx.stroke(); }
  drawLabels(hl);
  ctx.globalAlpha=1;
}

function drawLabels(hl){
  const placed=OVERLAYS.slice(); const k=cam.k;
  const fits = (x,y,w,h) => { if(x<2||y<2||x+w>W-2||y+h>H-2) return false; for(const p of placed) if(x<p[0]+p[2] && x+w>p[0] && y<p[1]+p[3] && y+h>p[1]) return false; placed.push([x,y,w,h]); return true; };
  const label = (n, txt, col, font, alpha) => { ctx.font=font; const w=ctx.measureText(txt).width; const r=radius(n); const x=n.sx+r+4, y=n.sy-7; if(!fits(x-2,y,w+4,14)) return; ctx.globalAlpha=alpha; ctx.lineWidth=3; ctx.strokeStyle=BG; ctx.lineJoin='round'; ctx.strokeText(txt,x,y+10.5); ctx.fillStyle=col; ctx.fillText(txt,x,y+10.5); };
  const short = s => s.length>30 ? s.slice(0,29)+'…' : s;
  // department titles
  ctx.font='600 12px "IBM Plex Sans", system-ui, sans-serif';
  for(const d of DEPTS){ const txt=d.name.toUpperCase(); const w=ctx.measureText(txt).width; const f=(400-d.rc-16)/400;
    const cands=[[d.cx*f,d.cy*f],[d.cx,d.cy-d.rc-12],[d.cx,d.cy+d.rc+14],[d.cx*(400+d.rc+16)/400,d.cy*(400+d.rc+16)/400]];
    let pos=null; for(const [wx,wy] of cands){ const x=(wx-cam.x)*k+W/2, y=(wy-cam.y)*k+H/2; const r=[x-w/2-2,y-8,w+4,16]; if(!placed.some(p=>r[0]<p[0]+p[2]&&r[0]+r[2]>p[0]&&r[1]<p[1]+p[3]&&r[1]+r[3]>p[1])){ pos=[x,y]; placed.push(r); break; } }
    if(!pos){ const x=(cands[0][0]-cam.x)*k+W/2, y=(cands[0][1]-cam.y)*k+H/2; pos=[x,y]; }
    ctx.globalAlpha = hl?0.45:0.95; ctx.lineWidth=4; ctx.strokeStyle=BG; ctx.strokeText(txt,pos[0]-w/2,pos[1]+4); ctx.fillStyle='#c3ccda'; ctx.fillText(txt,pos[0]-w/2,pos[1]+4); }
  const F = '500 11px "IBM Plex Sans", system-ui, sans-serif';
  if(S.hover!=null){ const n=N[S.hover]; label(n, short(n.name), '#ffffff', '600 12px "IBM Plex Sans", system-ui, sans-serif', 1); }
  if(S.pulse){ const n=N[S.pulse.id]; label(n, short(n.name), '#ffffff', '600 12px "IBM Plex Sans", system-ui, sans-serif', 1); }
  let count=0;
  if(hl){ for(const l of hl.labels){ if(count>110) break; const n=N[l.id]; const h=hl.nodes.get(l.id); if(!h) continue; if(h.step===S.step && S.t<0.6) continue; label(n, short(n.name), h.color===C.muted?'#c9d3e3':h.color, F, 1); count++; } }
  // zoom-dependent labels
  const vis = n => n.sx>-50 && n.sx<W+50 && n.sy>-20 && n.sy<H+20;
  const alpha = hl?0.45:0.85;
  for(const n of N){ if(count>160) break; if(hl && hl.nodes.has(n.id)) continue; if(!vis(n)) continue;
    const show = (n.type==='Skill'||n.type==='Certification') ? k>0.9 : n.type==='Role' ? k>1.15 : n.type==='Course' ? k>1.9 : n.type==='Team' ? k>2.3 : n.type==='Person' ? k>3.4 : false;
    if(show){ label(n, short(n.name), n.type==='Person'?'#c9d3e3':baseColor(n), F, alpha); count++; } }
}

function loop(now){
  if(camAnim){ const t=clamp((now-camAnim.t0)/camAnim.dur,0,1), e=t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2; cam.x=camAnim.from.x+(camAnim.to.x-camAnim.from.x)*e; cam.y=camAnim.from.y+(camAnim.to.y-camAnim.from.y)*e; cam.k=camAnim.from.k*Math.pow(camAnim.to.k/camAnim.from.k,e); if(t>=1) camAnim=null; dirty=true; }
  if(S.res && S.step>=0 && S.t<1){ S.t = clamp((now-S.stepStart)/stepDur(),0,1); dirty=true; if(S.t>=1){ if(S.step===S.res.steps.length-1 && !S.done) finish(); else renderTrace(); } }
  else if(S.playing && S.res && S.step<S.res.steps.length-1 && now-S.stepStart > stepDur()+260/S.speed){ advance(); }
  if(S.pulse) dirty=true;
  if(dirty){ draw(now); dirty=false; }
  requestAnimationFrame(loop);
}

// ---------- interaction ----------
let drag=null;
function pickAt(mx,my){ let best=null, bd=1e9; for(const n of N){ const r=Math.max(radius(n)+4, 7); const dx=n.sx-mx, dy=n.sy-my; let d=dx*dx+dy*dy; if(d>r*r) continue; if(HL && HL.nodes.has(n.id)) d*=0.5; if(n.type==='Department') d+=40; if(d<bd){bd=d;best=n;} } return best; }
const tip=$('tip');
function tipHTML(n){
  const rows=[];
  if(n.type==='Person'){ rows.push(esc(N[n.role].name), esc(deptName(n.dept))+(n.team!=null?' · '+esc(N[n.team].name):''), `${esc(n.loc)} · ${n.tenure} yrs · perf. ${n.perf}/5`); }
  else if(n.type==='Role'){ rows.push(`${esc(deptName(n.dept))} · seniority ${n.sen}`, `${n.hc} incumbent${n.hc===1?'':'s'}`); }
  else if(n.type==='Skill'){ rows.push(esc(n.cat), `held by ${n.holders} people`); }
  else if(n.type==='Course'){ rows.push(`${n.hours} h · ${esc(n.provider)}`, `teaches ${esc(N[n.skill].name)} up to level ${n.upTo}`); }
  else if(n.type==='Team'){ rows.push(esc(deptName(n.dept)), `${n.size} members · lead ${esc(N[n.lead].name)}`); }
  else if(n.type==='Department'){ rows.push(`${n.size} people`); }
  else if(n.type==='Certification'){ rows.push('Required for regulated roles'); }
  return `<span class="tt" style="color:${TYPE_COLOR[n.type]}">${n.type}</span><b>${esc(n.name)}</b>${rows.map(r=>`<span>${r}</span>`).join('')}<em>Click to query its neighbourhood</em>`;
}
cv.addEventListener('pointerdown', e=>{ drag={x:e.clientX,y:e.clientY,cx:cam.x,cy:cam.y,moved:false}; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e=>{
  const r=cv.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
  if(drag){ const dx=e.clientX-drag.x, dy=e.clientY-drag.y; if(Math.abs(dx)+Math.abs(dy)>4) drag.moved=true; if(drag.moved){ camAnim=null; cam.x=drag.cx-dx/cam.k; cam.y=drag.cy-dy/cam.k; cv.classList.add('grabbing'); tip.hidden=true; dirty=true; return; } }
  const n=pickAt(mx,my); const id=n?n.id:null;
  if(id!==S.hover){ S.hover=id; dirty=true; }
  if(n){ tip.innerHTML=tipHTML(n); tip.hidden=false; const tw=tip.offsetWidth, th=tip.offsetHeight; tip.style.left=Math.min(mx+14, r.width-tw-8)+'px'; tip.style.top=Math.min(my+14, r.height-th-8)+'px'; cv.style.cursor='pointer'; }
  else { tip.hidden=true; cv.style.cursor=''; }
});
cv.addEventListener('pointerleave', ()=>{ tip.hidden=true; if(S.hover!=null){ S.hover=null; dirty=true; } });
cv.addEventListener('pointerup', e=>{ cv.classList.remove('grabbing'); if(drag && !drag.moved){ const r=cv.getBoundingClientRect(); const n=pickAt(e.clientX-r.left, e.clientY-r.top); if(n) explore(n.id); } drag=null; });
cv.addEventListener('wheel', e=>{ e.preventDefault(); const r=cv.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top; const nk=clamp(cam.k*Math.exp(-e.deltaY*0.0016),0.15,8); const wx=(mx-W/2)/cam.k+cam.x, wy=(my-H/2)/cam.k+cam.y; cam.k=nk; cam.x=wx-(mx-W/2)/nk; cam.y=wy-(my-H/2)/nk; camAnim=null; dirty=true; }, {passive:false});
cv.addEventListener('keydown', e=>{ if(e.key==='+'||e.key==='=') zoomBy(1.4); else if(e.key==='-') zoomBy(1/1.4); else if(e.key==='0') fitAll(true); else if(e.key.startsWith('Arrow')){ const d=60/cam.k; if(e.key==='ArrowLeft') cam.x-=d; if(e.key==='ArrowRight') cam.x+=d; if(e.key==='ArrowUp') cam.y-=d; if(e.key==='ArrowDown') cam.y+=d; dirty=true; } else return; e.preventDefault(); });
function zoomBy(f){ setCam(cam.x, cam.y, clamp(cam.k*f,0.15,8), true); }
$('zin').addEventListener('click', ()=>zoomBy(1.5)); $('zout').addEventListener('click', ()=>zoomBy(1/1.5)); $('zfit').addEventListener('click', ()=>fitAll(true));
$('zclear').addEventListener('click', ()=>{ $('caption').textContent=''; S.res=null; S.step=-1; S.done=false; S.playing=false; S.pulse=null; HL=null; renderTrace(); renderResults(); renderCaption(); renderLegend(); measureOverlays(); $('stats').innerHTML='<div><span class="muted">Overview. Pick a question or click a node.</span></div>'; $('summary').innerHTML=''; $('resCount').textContent=''; for(const el of $('code').querySelectorAll('.ln')) el.classList.remove('on'); fitAll(true); updateButtons(); });
function explore(id){ S.qid='ego'; S.ego=id; renderQList(); renderParams(); run('play'); }

// ---------- data model dialog ----------
function schemaSVG(){
  const R = PG.relCounts; const f = t => fmt(R[t]||0);
  const P = {Department:[110,52], Team:[110,180], Person:[400,180], Role:[700,180], Skill:[400,370], Course:[110,370], Certification:[700,370]};
  const col = {Department:C.dept, Team:C.team, Person:C.person, Role:C.role, Skill:C.skill, Course:C.course, Certification:C.cert};
  const cnt = PG.counts;
  const box = (t) => { const [x,y]=P[t]; return `<g><rect x="${x-64}" y="${y-19}" width="128" height="38" rx="8" fill="#141f31" stroke="${col[t]}" stroke-width="1.5"/><text x="${x}" y="${y-1}" text-anchor="middle" class="sn">${t}</text><text x="${x}" y="${y+13}" text-anchor="middle" class="sc">${fmt(cnt[t])} nodes</text></g>`; };
  const edge = (d, lbl, lx, ly, anchor='middle') => `<path d="${d}" class="se" marker-end="url(#ar)"/>` + [].concat(lbl).map((l,i)=>`<text x="${lx}" y="${ly+i*14}" text-anchor="${anchor}" class="sl">${l}</text>`).join('');
  return `<svg viewBox="0 0 820 450" role="img" aria-label="Data model of the people graph"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#8d9ab0"/></marker></defs>
  ${edge('M110 161 V73', `PART_OF · ${f('PART_OF')}`, 118, 120, 'start')}
  ${edge('M336 180 H176', `MEMBER_OF · ${f('MEMBER_OF')}`, 256, 172)}
  ${edge('M340 161 L172 70', `HEADS`, 236, 92)}
  ${edge('M370 161 C 350 100, 420 100, 412 158', `REPORTS_TO · ${f('REPORTS_TO')}`, 385, 96)}
  ${edge('M430 161 C 470 70, 540 110, 450 168', `COLLABORATES_WITH · ${f('COLLABORATES_WITH')}`, 482, 80, 'start')}
  ${edge('M464 174 H634', `HOLDS · ${f('HOLDS')}`, 549, 166)}
  ${edge('M464 188 H634', `HELD · ${f('HELD')}`, 549, 202)}
  ${edge('M730 161 C 770 100, 650 100, 690 158', `MOVED_TO {moves}`, 710, 100)}
  ${edge('M400 199 V349', [`HAS_SKILL · ${f('HAS_SKILL')}`, `{level, source,`, ` confidence}`], 408, 256, 'start')}
  ${edge('M650 199 L452 351', `REQUIRES {level}`, 610, 246, 'start')}
  ${edge('M176 370 H334', `TEACHES {up_to}`, 256, 362)}
  ${edge('M360 199 L150 351', `COMPLETED · ${f('COMPLETED')}`, 204, 300, 'end')}
  ${edge('M80 389 C 60 440, 150 440, 130 391', `REQUIRES_COURSE`, 168, 432, 'start')}
  ${edge('M740 199 V349', `REQUIRES_CERT`, 732, 300, 'end')}
  ${edge('M464 199 L650 351', `CERTIFIED {expires}`, 628, 342, 'end')}
  ${Object.keys(P).map(box).join('')}</svg>`;
}
const dlg=$('modal');
$('btnModel').addEventListener('click', ()=>{ $('schema').innerHTML=schemaSVG(); dlg.hidden=false; $('closeModel').focus(); });
const closeDlg = () => { dlg.hidden=true; $('btnModel').focus(); };
$('closeModel').addEventListener('click', closeDlg);
dlg.addEventListener('click', e=>{ if(e.target===dlg) closeDlg(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !dlg.hidden) closeDlg(); });

// ---------- boot ----------
window.addEventListener('resize', ()=>{ resize(); });
resize(); fitAll(false); renderQList(); renderParams(); renderLegend(); updateButtons();
requestAnimationFrame(loop);
setTimeout(()=>run('play'), reduced?0:500);
})();
