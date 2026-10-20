// Pre-Con Priority dashboard: program-export upload, storage, and the #precon page.
// Depends on precon_engine.js (PCE), precon_rules_seed.js, and globals from index.html
// (sb, proj, es, st2, reportFail, openProjectByAddr, goToTracker, setViewHash, filterProj).
(function(){
const PC={rules:window.PRECON_RULES_SEED||[],rulesSource:'seed',db:'unknown',dbMsg:'',pulls:{},prev:{},changes:[],local:false,
  opts:{phase4:false,showHold:false},f:{p:[],pr:[],st:[],who:'',q:''},chg:{our:false,entered:false},result:null,loaded:false,uploads:[]};
window.PC=PC;
const LS_KEY='pic_precon_local_v1';
const T={pulls:'precon_pulls',recs:'precon_program_records',log:'precon_change_log',rules:'precon_rules'};
const isMissing=e=>e&&(e.code==='42P01'||e.code==='PGRST205'||/does not exist|could not find the table|schema cache/i.test(e.message||''));
const fmtET=d=>{if(!d)return'—';const x=d instanceof Date?d:new Date(d);if(isNaN(x))return'—';return x.toLocaleString('en-US',{timeZone:'America/New_York',month:'numeric',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})+' ET';};
const fmtDate=d=>{const x=new Date(d);return isNaN(x)?'':x.toLocaleDateString('en-US',{timeZone:'America/New_York',month:'2-digit',day:'2-digit',year:'numeric'});};
const PRI_LABEL={'1':'P1','2':'P2','Watch':'Watch','none':'Not ours'};
function btJobs(){const a=window._btAllJobs;return(Array.isArray(a)&&a.length)?a:(typeof proj!=='undefined'?proj:[]);}
function btActive(){return typeof proj!=='undefined'?proj:[];}

// ---------- storage ----------
async function pageAll(q){let out=[],from=0;for(;;){const{data,error}=await q().range(from,from+999);if(error)throw error;out=out.concat(data||[]);if(!data||data.length<1000)break;from+=1000;}return out;}
async function dbLoad(){
  try{
    const{data:pulls,error}=await sb.from(T.pulls).select('*').order('pull_at',{ascending:false}).limit(500);
    if(error)throw error;
    PC.db='ready';PC.dbMsg='';
    const latest={},prev={};
    (pulls||[]).forEach(p=>{if(!latest[p.program])latest[p.program]=p;else if(!prev[p.program])prev[p.program]=p;});
    const ids=[...Object.values(latest),...Object.values(prev)].map(p=>p.id);
    const recs=ids.length?await pageAll(()=>sb.from(T.recs).select('pull_id,record_id,data').in('pull_id',ids)):[];
    const byPull={};recs.forEach(r=>{(byPull[r.pull_id]=byPull[r.pull_id]||[]).push(r.data);});
    const mk=p=>({meta:{id:p.id,program:p.program,pull_at:p.pull_at,file_name:p.file_name,row_count:p.row_count,columns:p.columns||[]},records:byPull[p.id]||[]});
    PC.pulls={};PC.prev={};Object.values(latest).forEach(p=>PC.pulls[p.program]=mk(p));Object.values(prev).forEach(p=>PC.prev[p.program]=mk(p));
    const since=new Date(Date.now()-35*86400000).toISOString();
    PC.changes=await pageAll(()=>sb.from(T.log).select('*').gte('changed_at',since).order('changed_at',{ascending:false}));
    try{const{data:rr,error:re}=await sb.from(T.rules).select('*');if(!re&&rr&&rr.length){PC.rules=rr.map(r=>({RuleID:r.rule_id,Program:r.program,Field:r.field,Value:r.value,MatchType:r.match_type||'exact',OurCourt:r.our_court,Priority:r.priority||'',Action:r.action||'',Stage:r.stage,Source:r.source||'',Active:r.active||'Y',Notes:r.notes||''}));PC.rulesSource='database';}}catch(e){console.warn('[precon] rules table not used',e);}
  }catch(e){
    if(isMissing(e)){PC.db='missing';PC.dbMsg='The Pre-Con tables have not been created in Supabase yet.';}
    else{PC.db='error';PC.dbMsg='Could not reach the Pre-Con tables: '+(e.message||e);console.warn('[precon] load failed',e);}
    loadLocal();
  }
}
function loadLocal(){try{const s=JSON.parse(localStorage.getItem(LS_KEY)||'null');if(s&&s.pulls){PC.pulls=s.pulls;PC.prev=s.prev||{};PC.changes=s.changes||[];PC.local=true;}}catch(e){console.warn('[precon] local data unreadable',e);}}
function saveLocal(){try{localStorage.setItem(LS_KEY,JSON.stringify({pulls:PC.pulls,prev:PC.prev,changes:PC.changes}));}catch(e){reportFail('Saving dashboard data in this browser',e);}}

// ---------- upload / preview ----------
function readFile(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>{try{const ext=f.name.split('.').pop().toLowerCase();
  const wb=ext==='csv'?XLSX.read(new TextDecoder().decode(new Uint8Array(e.target.result)),{type:'string'}):XLSX.read(new Uint8Array(e.target.result),{type:'array'});
  const ws=wb.Sheets[wb.SheetNames[0]];const hdr=(XLSX.utils.sheet_to_json(ws,{header:1,blankrows:false})[0]||[]).map(h=>String(h==null?'':h).trim());
  const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false}).map(r=>{const o={};Object.keys(r).forEach(k=>{o[String(k).trim()]=typeof r[k]==='string'?r[k].trim():r[k];});return o;}).filter(r=>PCE.has(r.ID));
  res({sheet:wb.SheetNames[0],cols:hdr.filter(Boolean),rows});}catch(err){rej(err);}};r.onerror=()=>rej(r.error);r.readAsArrayBuffer(f);});}
function etInputValue(d){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(d);const g=k=>p.find(x=>x.type===k).value;return g('year')+'-'+g('month')+'-'+g('day')+'T'+g('hour')+':'+g('minute');}
function etFromInput(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);return m?PCE.etToUtc(+m[1],+m[2],+m[3],+m[4],+m[5]):null;}
async function pcuFiles(files){
  const list=document.getElementById('pcu-list');list.innerHTML='<div class="pc-muted">Reading files…</div>';
  PC.uploads=[];
  for(const f of files){
    try{const{sheet,cols,rows}=await readFile(f);const det=PCE.detectProgram(f.name,cols,rows);
      const pt=PCE.pullTimeFromName(f.name);const at=pt?PCE.etToUtc(pt.y,pt.mo,pt.d,pt.h,pt.mi):new Date();
      PC.uploads.push({name:f.name,sheet,cols,rows,program:det.program,how:det.how,pullAt:at,timeFrom:pt?'file name':'upload time',include:true});
    }catch(err){PC.uploads.push({name:f.name,error:String(err.message||err)});reportFail('Reading '+f.name,err);}
  }
  renderUploadPreview();
}
function uploadAnalysis(u){
  const p=u.program;if(!p)return{block:'Could not tell which program this file is. Rename it to start with LC_, OC_, PIN_, RFL_, SRQ_, PAS_ or GA_.'};
  const cur=PC.pulls[p];const keep=PCE.keepColumns(p,u.cols,PC.rules);
  const pull={meta:{program:p,pull_at:u.pullAt.toISOString(),file_name:u.name,row_count:u.rows.length,columns:keep},records:u.rows.map(r=>PCE.trimRecord(r,keep))};
  const missLead=PCE.LEAD.filter(c=>!u.cols.includes(c));
  const ruleF=[...new Set(PC.rules.filter(r=>r.Program===p&&(r.Active||'Y')==='Y').map(r=>r.Field))].filter(f=>!u.cols.includes(f));
  const scopeMissing=!u.cols.includes(PCE.SCOPE[p]);
  const newCols=cur?u.cols.filter(c=>!(cur.meta.columns||[]).includes(c)&&keep.includes(c)):[];
  const goneCols=cur?(cur.meta.columns||[]).filter(c=>!u.cols.includes(c)):[];
  let block='';
  if(scopeMissing)block='Scope field "'+PCE.SCOPE[p]+'" is missing — this pull would be skipped.';
  else if(cur&&cur.records.length&&u.rows.length<0.8*cur.records.length)block='Only '+u.rows.length+' records vs '+cur.records.length+' in the last pull (under 80%). Skipped to avoid logging mass removals.';
  if(cur&&new Date(cur.meta.pull_at)>=u.pullAt&&!block)block='Older than or same as the current pull ('+fmtET(cur.meta.pull_at)+').';
  // matching + queue impact
  const one={};one[p]=pull;const after=PCE.evaluate(Object.assign({},PC.pulls,one),btJobs(),PC.rules,{phase4:PC.opts.phase4});
  const before=cur?PCE.evaluate(PC.pulls,btJobs(),PC.rules,{phase4:PC.opts.phase4}):null;
  const cnt=res=>{const c={'1':0,'2':0,'Watch':0,'none':0};if(res)res.queue.filter(q=>q.program===p).forEach(q=>c[q.priority]++);return c;};
  const changes=block?[]:PCE.diffPulls(p,cur||null,pull,(cur?cur.meta.file_name+' -> ':'')+u.name);
  return{pull,missLead,ruleF,newCols,goneCols,block,stats:after.stats[p],before:cnt(before),after:cnt(after),changes};
}
function renderUploadPreview(){
  const list=document.getElementById('pcu-list');
  if(!PC.uploads.length){list.innerHTML='';return;}
  const opts=PCE.PROGRAMS.map(p=>'<option value="'+p+'">'+p+' — '+PCE.PROGRAM_NAMES[p]+'</option>').join('');
  const newest={};PC.uploads.forEach(u=>{if(u.program&&!u.error&&(!newest[u.program]||u.pullAt>newest[u.program].pullAt))newest[u.program]=u;});
  list.innerHTML=PC.uploads.map((u,i)=>{
    if(u.error)return'<div class="pcu-file err"><b>'+es(u.name)+'</b><div>Could not read file: '+es(u.error)+'</div></div>';
    const a=u._a=uploadAnalysis(u);if(newest[u.program]&&newest[u.program]!==u&&!a.block)a.block='A newer '+u.program+' file is in this upload ('+newest[u.program].name+'); only the newest is used.';
    if(a.block)u.include=false;
    const s=a.stats||{};const d=(k)=>{const b=a.before[k],c=a.after[k];return c+(b!==c&&PC.pulls[u.program]?' <span class="pc-delta">('+(c>b?'+':'')+(c-b)+')</span>':'');};
    const sc=a.changes||[];const st=sc.filter(c=>c.field!=='(record)'),rec=sc.filter(c=>c.field==='(record)');
    return'<div class="pcu-file'+(a.block?' blocked':'')+'"><div class="pcu-top"><label class="pcu-inc"><input type="checkbox" '+(u.include?'checked':'')+(a.block?' disabled':'')+' onchange="PC.uploads['+i+'].include=this.checked;pcUpdConfirm()"> <b>'+es(u.name)+'</b></label>'+
      '<select onchange="PC.uploads['+i+'].program=this.value;renderUploadPreview()"><option value="">— program —</option>'+opts.replace('value="'+u.program+'"','value="'+u.program+'" selected')+'</select>'+
      '<span class="pc-muted">'+(u.how?'detected by '+es(u.how):'not detected')+'</span>'+
      '<label class="pc-muted">Pull time (ET) <input type="datetime-local" value="'+etInputValue(u.pullAt)+'" onchange="pcSetTime('+i+',this.value)"></label><span class="pc-muted">from '+es(u.timeFrom)+'</span></div>'+
      (a.block?'<div class="pc-warn">&#9940; '+es(a.block)+'</div>':'')+
      '<div class="pcu-grid"><div><b>'+u.rows.length+'</b> records'+(PC.pulls[u.program]?' <span class="pc-muted">(last pull '+PC.pulls[u.program].records.length+')</span>':'')+'</div>'+
      '<div>Match vs BT: <b>'+(s.id||0)+'</b> by ID · <b>'+(s.address||0)+'</b> by address · <b>'+(s.none||0)+'</b> unmatched'+(s.ambiguous?' · <b>'+s.ambiguous+'</b> ambiguous':'')+'</div>'+
      '<div>Queue impact: in scope <b>'+(s.inScope||0)+'</b> → P1 '+d('1')+' · P2 '+d('2')+' · Watch '+d('Watch')+' · Not ours '+d('none')+'</div>'+
      '<div>Status changes: <b>'+st.length+'</b>'+(rec.length?' · records added/removed: <b>'+rec.length+'</b>':'')+(PC.pulls[u.program]?'':' <span class="pc-muted">(first pull: backfilled from “Updated” columns)</span>')+'</div></div>'+
      (a.missLead.length?'<div class="pc-warn">Missing standard columns: '+a.missLead.map(es).join(', ')+'</div>':'')+
      (a.ruleF.length?'<div class="pc-warn">Rule fields not in file: '+a.ruleF.map(es).join(', ')+'</div>':'')+
      (a.goneCols.length?'<div class="pc-note">Columns dropped since last pull: '+a.goneCols.slice(0,20).map(es).join(', ')+'</div>':'')+
      (a.newCols.length?'<div class="pc-note">New columns: '+a.newCols.slice(0,20).map(es).join(', ')+'</div>':'')+
      (st.length?'<details><summary>Show status changes</summary><div class="pcu-chg">'+st.slice(0,100).map(c=>'<div>'+es(c.record_id)+' · '+es(c.field)+': '+es(c.old_value||'∅')+' → <b>'+es(c.new_value||'∅')+'</b></div>').join('')+(st.length>100?'<div>…'+(st.length-100)+' more</div>':'')+'</div></details>':'')+
    '</div>';}).join('');
  pcUpdConfirm();
}
window.pcSetTime=(i,v)=>{const d=etFromInput(v);if(d){PC.uploads[i].pullAt=d;PC.uploads[i].timeFrom='edited';renderUploadPreview();}};
window.renderUploadPreview=renderUploadPreview;
window.pcUpdConfirm=function(){const n=PC.uploads.filter(u=>u.include&&u._a&&!u._a.block).length;
  const c=document.getElementById('pcu-confirm'),l=document.getElementById('pcu-local');
  c.disabled=!n||PC.db!=='ready';c.textContent=n?'Confirm & Save '+n+' file'+(n>1?'s':'')+' to Cloud':'Confirm & Save to Cloud';
  c.title=PC.db!=='ready'?'Database setup needed — see sql/precon_tables.sql':'';l.disabled=!n;
  document.getElementById('pcu-dbnote').style.display=PC.db==='ready'?'none':'block';};
function applyUploads(sel){
  sel.forEach(u=>{const p=u.program;const a=u._a;if(PC.pulls[p])PC.prev[p]=PC.pulls[p];PC.pulls[p]=a.pull;
    const keyed=new Set(PC.changes.map(c=>[c.program,c.record_id,c.field,c.new_value,c.changed_at].join('|')));
    a.changes.forEach(c=>{const k=[c.program,c.record_id,c.field,c.new_value,c.changed_at].join('|');if(!keyed.has(k)){PC.changes.push(c);keyed.add(k);}});});
  const cutoff=Date.now()-35*86400000;PC.changes=PC.changes.filter(c=>new Date(c.changed_at).getTime()>=cutoff);
}
window.pcUseLocal=function(){const sel=PC.uploads.filter(u=>u.include&&u._a&&!u._a.block);if(!sel.length)return;applyUploads(sel);PC.local=true;saveLocal();closeUploads();renderPrecon();st2('Loaded '+sel.length+' file(s) in this browser only (not saved to cloud).');};
window.pcConfirm=async function(){
  const sel=PC.uploads.filter(u=>u.include&&u._a&&!u._a.block);if(!sel.length||PC.db!=='ready')return;
  const btn=document.getElementById('pcu-confirm');btn.disabled=true;btn.textContent='Saving…';
  let ok=0;
  for(const u of sel){const a=u._a,m=a.pull.meta;
    try{
      const{data:pr,error:e1}=await sb.from(T.pulls).insert({program:m.program,pull_at:m.pull_at,file_name:m.file_name,row_count:m.row_count,columns:m.columns}).select().single();if(e1)throw e1;
      const rows=a.pull.records.map(r=>({pull_id:pr.id,program:m.program,record_id:String(r.ID),address:r.Address||'',applicant:r.Applicant||'',data:r}));
      for(let i=0;i<rows.length;i+=200){const{error}=await sb.from(T.recs).insert(rows.slice(i,i+200));if(error)throw error;}
      const ch=a.changes.map(c=>({...c,bt_job_name:null}));
      for(let i=0;i<ch.length;i+=200){const{error}=await sb.from(T.log).upsert(ch.slice(i,i+200),{onConflict:'program,record_id,field,new_value,changed_at',ignoreDuplicates:true});if(error)throw error;}
      // keep record rows for the 2 newest pulls of this program (pull metadata is kept)
      const{data:old}=await sb.from(T.pulls).select('id').eq('program',m.program).order('pull_at',{ascending:false}).range(2,200);
      if(old&&old.length){const{error}=await sb.from(T.recs).delete().in('pull_id',old.map(o=>o.id));if(error)console.warn('[precon] prune failed',error);}
      ok++;
    }catch(e){reportFail('Saving '+u.name,e);}
  }
  if(ok){localStorage.removeItem(LS_KEY);PC.local=false;await dbLoad();}
  closeUploads();renderPrecon();if(ok)st2('Saved '+ok+' program export'+(ok>1?'s':'')+' to cloud.');
};
window.openUploads=function(){PC.uploads=[];document.getElementById('pcu-list').innerHTML='';document.getElementById('pcu-modal').classList.add('open');pcUpdConfirm();};
window.closeUploads=function(){document.getElementById('pcu-modal').classList.remove('open');PC.uploads=[];};
window.pcuPick=e=>{const fs=[...e.target.files];e.target.value='';if(fs.length)pcuFiles(fs);};
window.pcuDrop=e=>{e.preventDefault();const fs=[...e.dataTransfer.files];if(fs.length)pcuFiles(fs);};

// ---------- page ----------
function readHash(){const h=(location.hash||'').replace(/^#/,'');const q=h.split('?')[1]||'';const sp=new URLSearchParams(q);
  PC.f={p:(sp.get('p')||'').split(',').filter(Boolean),pr:(sp.get('pr')||'').split(',').filter(Boolean),st:(sp.get('st')||'').split(',').filter(Boolean),who:sp.get('who')||'',q:sp.get('q')||''};
  PC.opts.showHold=sp.get('hold')==='1';PC.opts.phase4=sp.get('p4')==='1';}
function writeHash(){const sp=new URLSearchParams();if(PC.f.p.length)sp.set('p',PC.f.p.join(','));if(PC.f.pr.length)sp.set('pr',PC.f.pr.join(','));if(PC.f.st.length)sp.set('st',PC.f.st.join(','));
  if(PC.f.who)sp.set('who',PC.f.who);if(PC.f.q)sp.set('q',PC.f.q);if(PC.opts.showHold)sp.set('hold','1');if(PC.opts.phase4)sp.set('p4','1');const s=sp.toString();
  history.replaceState(null,'','#precon'+(s?'?'+s:''));}
window.openPrecon=async function(){
  const _h=location.hash;
  if(typeof goToTracker==='function'&&!PC._opening){PC._opening=true;try{goToTracker();}finally{PC._opening=false;}}
  history.replaceState(null,'',_h&&_h.startsWith('#precon')?_h:'#precon');readHash();const v=document.getElementById('pc-view');v.classList.add('open');writeHash();
  document.getElementById('pc-view-btn')?.classList.add('active-view');document.getElementById('tracker-home-btn')?.classList.remove('active-view');
  if(!PC.loaded){document.getElementById('pc-body').innerHTML='<div class="pc-muted" style="padding:30px">Loading pre-con data…</div>';if(!PC._loading)PC._loading=dbLoad();await PC._loading;PC.loaded=true;}
  renderPrecon();};
window.closePrecon=function(){const v=document.getElementById('pc-view');if(!v||!v.classList.contains('open'))return;v.classList.remove('open');document.getElementById('pc-view-btn')?.classList.remove('active-view');};
window.pcToggle=(k,v)=>{const a=PC.f[k];const i=a.indexOf(v);if(i>=0)a.splice(i,1);else a.push(v);writeHash();renderPrecon();};
window.pcSet=(k,v)=>{PC.f[k]=v;writeHash();renderPrecon();};
window.pcOpt=(k,v)=>{PC.opts[k]=v;writeHash();renderPrecon();};
window.pcCell=(p,pr)=>{PC.f.p=p?[p]:[];PC.f.pr=pr?[pr]:[];writeHash();renderPrecon();document.getElementById('pc-queue')?.scrollIntoView({behavior:'smooth'});};
window.pcClear=()=>{PC.f={p:[],pr:[],st:[],who:'',q:''};writeHash();renderPrecon();};
window.pcChg=(k,v)=>{PC.chg[k]=v;renderPrecon();};
window.pcOpenJob=addr=>{closePrecon();goToTracker();if(typeof openProjectByAddr==='function')openProjectByAddr(addr);};
window.pcExpand=i=>{const el=document.getElementById('pc-hits-'+i);if(el)el.style.display=el.style.display==='none'?'block':'none';};
function filterItems(items){const f=PC.f,q=f.q.toLowerCase();
  return items.filter(x=>(!f.p.length||f.p.includes(x.program))&&(!f.pr.length||f.pr.includes(x.priority))&&(!f.st.length||f.st.includes(x.stage))&&
    (!f.who||x.superintendent===f.who||x.cm===f.who)&&(!q||[x.address,x.record_id,x.applicant,x.bt&&x.bt.address].join(' ').toLowerCase().includes(q)));}
const chip=p=>'<span class="pc-chip pc-p'+(p==='Watch'?'w':p==='none'?'n':p)+'">'+PRI_LABEL[p]+'</span>';
function businessDaysSince(d){let n=0;const x=new Date(d);const now=new Date();while(x<now){x.setDate(x.getDate()+1);const w=x.getDay();if(x<now&&w!==0&&w!==6)n++;}return n;}
window.renderPrecon=function(){
  const body=document.getElementById('pc-body');if(!body)return;
  const R=PCE.prepRules(PC.rules);
  let res;try{res=PCE.evaluate(PC.pulls,btJobs(),PC.rules,{phase4:PC.opts.phase4,showHold:PC.opts.showHold,changes:PC.changes,activeFilter:true});}catch(e){reportFail('Pre-Con dashboard',e);return;}
  // BT-only jobs must still be active in the hub (no withdrawn / Volusia)
  const act=new Set(btActive().map(j=>j.address));res.queue=res.queue.filter(x=>x.program!=='BT'||act.has(x.address));
  PC.result=res;const now=Date.now();
  // header
  let h='<div class="pc-asof"><b>Data as of</b>'+PCE.PROGRAMS.map(p=>{const pl=PC.pulls[p];if(!pl)return'<span class="pc-src miss" title="No pull uploaded">'+p+': none</span>';
    const stale=now-new Date(pl.meta.pull_at).getTime()>3*3600000;return'<span class="pc-src'+(stale?' stale':'')+'" title="'+es(pl.meta.file_name||'')+'">'+p+': '+fmtET(pl.meta.pull_at)+'</span>';}).join('');
  const bt=localStorage.getItem('pic_bt_import_at');h+='<span class="pc-src'+(bt&&businessDaysSince(bt)>=1?' stale':'')+(bt?'':' miss')+'">BT: '+(bt?fmtET(bt):'import time unknown')+'</span></div>';
  if(PC.db!=='ready')h+='<div class="pc-banner"><b>&#9888; Database setup needed.</b> '+es(PC.dbMsg)+' Run <code>sql/precon_tables.sql</code> in Supabase to save uploads for everyone. Until then you can upload program exports and use them <b>in this browser only</b>.'+(PC.local?' <i>Showing locally loaded data.</i>':'')+'</div>';
  else if(PC.local)h+='<div class="pc-banner">Showing data loaded in this browser only.</div>';
  if(!Object.keys(PC.pulls).length)h+='<div class="pc-empty">No program exports loaded yet. Click <b>&#8679; Program Exports</b> to upload the LC, OC, PIN, RFL, SRQ, PAS and GA files.</div>';
  // counts
  const inScope=res.queue;const cnt=k=>inScope.filter(x=>x.priority===k).length;
  h+='<div class="pc-cards">'+[['1','P1 — front end'],['2','P2 — permitting → NTP'],['Watch','Watch'],['none','Not our court']].map(([k,l])=>'<div class="pc-card pc-c'+(k==='Watch'?'w':k==='none'?'n':k)+'" onclick="pcCell(\'\',\''+k+'\')"><b>'+cnt(k)+'</b><span>'+l+'</span></div>').join('')+'</div>';
  {const pq=inScope.filter(x=>x.program!=='BT');const c=k=>pq.filter(x=>x.priority===k).length;h+='<div class="pc-muted">Program records in scope: <b>'+pq.length+'</b> (P1 '+c('1')+' · P2 '+c('2')+' · Watch '+c('Watch')+' · Not ours '+c('none')+') · BT-only jobs: <b>'+(inScope.length-pq.length)+'</b></div>';}
  const progs=[...PCE.PROGRAMS,'BT'];
  h+='<table class="pc-matrix"><thead><tr><th>Program</th><th>P1</th><th>P2</th><th>Watch</th><th>Not ours</th><th>Total</th></tr></thead><tbody>'+progs.map(p=>{const it=inScope.filter(x=>x.program===p);const c=k=>it.filter(x=>x.priority===k).length;
    return'<tr><td title="'+es(PCE.PROGRAM_NAMES[p]||'Buildertrend-only jobs')+'">'+(p==='BT'?'BT-only':p)+'</td>'+['1','2','Watch','none'].map(k=>'<td class="pc-cell'+(c(k)?'':' z')+'" onclick="pcCell(\''+p+'\',\''+k+'\')">'+c(k)+'</td>').join('')+'<td class="pc-cell" onclick="pcCell(\''+p+'\',\'\')"><b>'+it.length+'</b></td></tr>';}).join('')+
    '<tr class="pc-tot"><td>Total</td>'+['1','2','Watch','none'].map(k=>'<td>'+cnt(k)+'</td>').join('')+'<td>'+inScope.length+'</td></tr></tbody></table>';
  // filters
  const stages=[...new Set(inScope.map(x=>x.stage).filter(Boolean))].sort((a,b)=>PCE.STAGE_ORDER.indexOf(a)-PCE.STAGE_ORDER.indexOf(b));
  const who=[...new Set(inScope.flatMap(x=>[x.superintendent,x.cm]).filter(Boolean))].sort();
  const fc=(k,v,l)=>'<button class="pc-f'+(PC.f[k].includes(v)?' on':'')+'" onclick="pcToggle(\''+k+'\',\''+es(v)+'\')">'+es(l||v)+'</button>';
  h+='<div class="pc-filters" id="pc-queue"><div>'+progs.map(p=>fc('p',p,p==='BT'?'BT-only':p)).join('')+'</div><div>'+['1','2','Watch','none'].map(k=>fc('pr',k,PRI_LABEL[k])).join('')+'</div><div>'+stages.map(s=>fc('st',s)).join('')+'</div>'+
    '<div><select onchange="pcSet(\'who\',this.value)"><option value="">All superintendents / CMs</option>'+who.map(w=>'<option'+(w===PC.f.who?' selected':'')+'>'+es(w)+'</option>').join('')+'</select>'+
    '<input type="search" placeholder="Search address, ID, applicant…" value="'+es(PC.f.q)+'" onchange="pcSet(\'q\',this.value)">'+
    '<label><input type="checkbox" '+(PC.opts.showHold?'checked':'')+' onchange="pcOpt(\'showHold\',this.checked)"> Show on-hold</label>'+
    '<label title="Also use the newer Buildertrend fields (RFI, septic, ISV scheduled, CE returned, permit kickback, Building Permit dropdown)"><input type="checkbox" '+(PC.opts.phase4?'checked':'')+' onchange="pcOpt(\'phase4\',this.checked)"> Phase 4 BT rules</label>'+
    '<button class="pc-f" onclick="pcClear()">Clear filters</button></div></div>';
  // queue
  const fl=filterItems(inScope);const main=fl.filter(x=>x.priority==='1'||x.priority==='2'),watch=fl.filter(x=>x.priority==='Watch'),none=fl.filter(x=>x.priority==='none');
  const row=(x,i)=>{const t=x.primary;const btn=x.bt&&x.bt.address&&x.bt.address!==x.address?'<div class="pc-sub">BT: '+es(x.bt.address)+'</div>':'';
    const more=x.hits.length>1?' <a href="#" onclick="pcExpand('+i+');return false">+'+(x.hits.length-1)+' more</a><div id="pc-hits-'+i+'" style="display:none" class="pc-sub">'+x.hits.slice(1).map(hh=>chip(hh.rule.Priority)+' '+es(hh.rule.Action)+' <i>('+es(hh.fields.join('; '))+')</i>').join('<br>')+'</div>':'';
    return'<tr><td>'+chip(x.priority)+'</td><td><b>'+es(x.address)+'</b>'+btn+'<div class="pc-sub">'+es(x.applicant)+' · '+es(x.record_id)+'</div></td><td title="'+es(PCE.PROGRAM_NAMES[x.program]||x.bt_group||'')+'">'+(x.program==='BT'?'BT <span class="pc-sub">'+es(x.bt_group||'')+'</span>':x.program)+'</td>'+
      '<td>'+(t?es(t.fields.join('; ')):es(x.scope_value||''))+'</td><td>'+(t?es(t.rule.Action):'<span class="pc-muted">—</span>')+more+'</td><td>'+es(x.stage||'')+'</td>'+
      '<td title="'+es(x.days_basis||'')+'">'+(x.days==null?'':(x.days_ge?'≥ ':'')+x.days)+'</td><td>'+es(x.superintendent)+(x.cm?'<div class="pc-sub">CM: '+es(x.cm)+'</div>':x.program_cm?'<div class="pc-sub" title="Program CM">('+es(x.program_cm)+')</div>':'')+'</td>'+
      '<td>'+(x.bt?'<a href="#" onclick="pcOpenJob(\''+es(String(x.bt.address).replace(/'/g,"\\'"))+'\');return false">Open</a>':'')+'</td></tr>';};
  const tbl=(items,off)=>'<table class="pc-q"><thead><tr><th>Pri</th><th>Job</th><th>Program</th><th>Status</th><th>Action</th><th>Stage</th><th>Days</th><th>Super / CM</th><th></th></tr></thead><tbody>'+(items.length?items.map((x,i)=>row(x,i+off)).join(''):'<tr><td colspan="9" class="pc-muted">Nothing here with the current filters.</td></tr>')+'</tbody></table>';
  h+='<h3 class="pc-h">Priority queue <span class="pc-muted">('+main.length+')</span></h3>'+tbl(main,0);
  h+='<details class="pc-sec"><summary>Watch list ('+watch.length+')</summary>'+tbl(watch,1000)+'</details>';
  h+='<details class="pc-sec"><summary>Not our court ('+none.length+')</summary>'+tbl(none,2000)+'</details>';
  // recent changes
  const wk=now-7*86400000;const scopeKeys=new Set(inScope.map(x=>x.program+'|'+x.record_id));
  let ch=PC.changes.filter(c=>new Date(c.changed_at).getTime()>=wk&&scopeKeys.has(c.program+'|'+c.record_id));
  const qk=new Set(fl.map(x=>x.program+'|'+x.record_id));ch=ch.filter(c=>qk.has(c.program+'|'+c.record_id));
  ch=ch.map(c=>{const nowY=c.field!=='(record)'&&PCE.ourCourt(R,c.program,c.field,c.new_value);const wasY=c.old_value!=='(unknown)'&&PCE.ourCourt(R,c.program,c.field,c.old_value);return{...c,nowY,entered:nowY&&!wasY};});
  if(PC.chg.our)ch=ch.filter(c=>c.nowY);if(PC.chg.entered)ch=ch.filter(c=>c.entered);
  ch.sort((a,b)=>String(b.changed_at).localeCompare(String(a.changed_at)));
  h+='<h3 class="pc-h">Recent changes <span class="pc-muted">(last 7 days, pre-con scope: '+ch.length+')</span> <label class="pc-tg"><input type="checkbox" '+(PC.chg.our?'checked':'')+' onchange="pcChg(\'our\',this.checked)"> Now in our court</label><label class="pc-tg"><input type="checkbox" '+(PC.chg.entered?'checked':'')+' onchange="pcChg(\'entered\',this.checked)"> Entered our court</label></h3>';
  h+='<div class="pc-scroll"><table class="pc-q"><thead><tr><th>Changed (ET)</th><th>Program</th><th>ID</th><th>Address</th><th>Applicant</th><th>Field</th><th>Old → New</th><th>Our court</th><th>Source</th></tr></thead><tbody>'+(ch.length?ch.slice(0,300).map(c=>'<tr><td>'+(c.changed_at_precision==='detected'?'≤ ':'')+fmtET(c.changed_at)+'</td><td>'+c.program+'</td><td>'+es(c.record_id)+'</td><td>'+es(c.address)+'</td><td>'+es(c.applicant)+'</td><td>'+es(c.field)+'</td><td>'+es(c.old_value)+' → <b>'+es(c.new_value)+'</b></td><td>'+(c.entered?'<span class="pc-chip pc-p1">Entered</span>':c.nowY?'Yes':'')+'</td><td class="pc-sub">'+es(c.source)+'</td></tr>').join(''):'<tr><td colspan="9" class="pc-muted">No changes in the last 7 days. Changes appear after a second pull of the same program (or from “Updated” dates on the first pull).</td></tr>')+'</tbody></table></div>';
  // gaps
  const g=res.gaps;const um=Object.entries(g.unmapped).map(([k,n])=>{const[p,f,v]=k.split('|');return{p,f,v,n};}).sort((a,b)=>b.n-a.n);
  const gl=(t,arr,fn)=>'<details class="pc-gap"><summary>'+t+' <b>('+arr.length+')</b></summary><div class="pc-gl">'+(arr.length?arr.slice(0,300).map(fn).join(''):'<div class="pc-muted">None</div>')+'</div></details>';
  const idf=x=>'<div>'+x.program+' · '+es(x.id)+' · '+es(x.address||'')+'</div>';
  h+='<h3 class="pc-h">Gaps</h3><div class="pc-gaps">'+
    gl('Unknown RFI',g.unknownRfi,idf)+gl('Unknown septic',g.unknownSeptic,x=>'<div>'+x.program+' · '+es(x.id)+' · '+es(x.address)+' · <i>'+es(x.septic||'blank')+'</i></div>')+
    gl('Unmatched (no BT job by case # or address)',g.unmatched,x=>'<div>'+x.program+' · '+es(x.id)+' · '+es(x.address||'')+' · '+es(x.applicant||'')+'</div>')+
    gl('Ambiguous matches',g.ambiguous,idf)+gl('Stage mismatch (program pre-con, BT 20+)',g.stageMismatch,x=>'<div>'+x.program+' · '+es(x.id)+' · '+es(x.address)+' · '+es(x.program_value)+' vs BT '+es(x.bt_status)+'</div>')+
    gl('Unmapped values',um,x=>'<div>'+x.p+' · '+es(x.f)+' = <b>'+es(x.v)+'</b> ('+x.n+')</div>')+gl('Missing fields',g.missingFields,x=>'<div>'+x.program+' · '+es(x.field)+'</div>')+'</div>';
  body.innerHTML=h;
};
window.openPcRules=function(){const q=(document.getElementById('pcr-q')||{}).value||'';const rs=PC.rules.filter(r=>!q||Object.values(r).join(' ').toLowerCase().includes(q.toLowerCase()));
  document.getElementById('pcr-meta').textContent=PC.rules.length+' rules · source: '+(PC.rulesSource==='seed'?'bundled seed (precon_rules_seed.js)':'Supabase precon_rules');
  document.getElementById('pcr-list').innerHTML='<table class="pc-q"><thead><tr><th>ID</th><th>Program</th><th>Field</th><th>Value</th><th>Match</th><th>Our court</th><th>Pri</th><th>Action</th><th>Stage</th><th>Source</th><th>Active</th><th>Notes</th></tr></thead><tbody>'+rs.map(r=>'<tr'+(r.Active==='N'?' class="pc-off"':'')+'><td>'+es(r.RuleID)+'</td><td>'+es(r.Program)+'</td><td>'+es(r.Field)+'</td><td>'+es(r.Value)+'</td><td>'+es(r.MatchType)+'</td><td>'+es(r.OurCourt)+'</td><td>'+es(r.Priority)+'</td><td>'+es(r.Action)+'</td><td>'+es(r.Stage)+'</td><td>'+es(r.Source)+'</td><td>'+es(r.Active)+'</td><td>'+es(r.Notes)+'</td></tr>').join('')+'</tbody></table>';
  document.getElementById('pcr-modal').classList.add('open');};
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('#hdr-views button');if(b&&b.id!=='pc-view-btn')closePrecon();},true);
window.closePcRules=()=>document.getElementById('pcr-modal').classList.remove('open');
})();
