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
    const tile=(l,v,sub)=>'<div class="pcu-t"><span>'+l+'</span><b>'+v+'</b>'+(sub?'<em>'+sub+'</em>':'')+'</div>';
    return'<div class="pcu-file'+(a.block?' blocked':'')+'"><div class="pcu-top"><label class="pcu-inc"><input type="checkbox" '+(u.include?'checked':'')+(a.block?' disabled':'')+' onchange="PC.uploads['+i+'].include=this.checked;pcUpdConfirm()"><span class="pcu-ic">'+(u.program||'?')+'</span><span class="pcu-nm"><b>'+es(u.name)+'</b><em>'+(u.how?'Detected by '+es(u.how):'Program not detected')+'</em></span></label>'+
      '<div class="pcu-ctl"><label><span>Program</span><select onchange="PC.uploads['+i+'].program=this.value;renderUploadPreview()"><option value="">— program —</option>'+opts.replace('value="'+u.program+'"','value="'+u.program+'" selected')+'</select></label>'+
      '<label><span>Pull time (ET) · from '+es(u.timeFrom)+'</span><input type="datetime-local" value="'+etInputValue(u.pullAt)+'" onchange="pcSetTime('+i+',this.value)"></label></div></div>'+
      (a.block?'<div class="pc-warn bad">&#9940; '+es(a.block)+'</div>':'')+
      '<div class="pcu-grid">'+tile('Records',u.rows.length,PC.pulls[u.program]?'last pull '+PC.pulls[u.program].records.length:'')+
      tile('Matched to BT',(s.id||0)+(s.address||0),(s.id||0)+' by ID · '+(s.address||0)+' by address')+
      tile('Unmatched',(s.none||0)+(s.ambiguous?' <small>+'+s.ambiguous+' amb.</small>':''),'')+
      tile('In scope',(s.inScope||0),'P1 '+d('1')+' · P2 '+d('2')+' · Watch '+d('Watch')+' · Not ours '+d('none'))+
      tile('Status changes',st.length,(rec.length?'records ±'+rec.length+' · ':'')+(PC.pulls[u.program]?'vs last pull':'first pull, backfilled'))+'</div>'+
      (a.missLead.length?'<div class="pc-warn">Missing standard columns: '+a.missLead.map(es).join(', ')+'</div>':'')+
      (a.ruleF.length?'<div class="pc-warn">Rule fields not in file: '+a.ruleF.map(es).join(', ')+'</div>':'')+
      (a.goneCols.length?'<div class="pc-note">Columns dropped since last pull: '+a.goneCols.slice(0,20).map(es).join(', ')+'</div>':'')+
      (a.newCols.length?'<div class="pc-note">New columns: '+a.newCols.slice(0,20).map(es).join(', ')+'</div>':'')+
      (st.length?'<details class="pcu-det"><summary>Show '+st.length+' status change'+(st.length>1?'s':'')+'</summary><div class="pcu-chg">'+st.slice(0,100).map(c=>'<div><span class="pc-sub">'+es(c.record_id)+' · '+es(c.field)+'</span> '+es(c.old_value||'∅')+' → <b>'+es(c.new_value||'∅')+'</b></div>').join('')+(st.length>100?'<div>…'+(st.length-100)+' more</div>':'')+'</div></details>':'')+
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
window.pcAct=(k,v)=>{PC.ui=PC.ui||{act:{},open:{}};PC.ui.act[k]=v;renderPrecon();};
window.pcRow=(tr,key)=>{if(window.getSelection&&String(window.getSelection()))return;PC.ui=PC.ui||{act:{},open:{}};const on=!PC.ui.open[key];if(on)PC.ui.open[key]=1;else delete PC.ui.open[key];tr.classList.toggle('open',on);const d=tr.nextElementSibling;if(on&&!d.firstChild.innerHTML){const x=(PC.result.queue||[]).find(q=>q.job_key===key);if(x)d.firstChild.innerHTML=PC._detail(x);}d.hidden=!on;};
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
  // ---- header: data freshness ----
  const srcs=PCE.PROGRAMS.map(p=>{const pl=PC.pulls[p];if(!pl)return'<span class="pc-src miss" title="No pull uploaded">'+p+' <i>none</i></span>';
    const stale=now-new Date(pl.meta.pull_at).getTime()>3*3600000;return'<span class="pc-src'+(stale?' stale':'')+'" title="'+es(pl.meta.file_name||'')+'">'+p+' <i>'+fmtET(pl.meta.pull_at)+'</i></span>';}).join('');
  const bt=localStorage.getItem('pic_bt_import_at');
  const nStale=PCE.PROGRAMS.filter(p=>!PC.pulls[p]||now-new Date(PC.pulls[p].meta.pull_at).getTime()>3*3600000).length;
  let h='<details class="pc-asof"><summary><span class="pc-dot '+(nStale?'warn':'ok')+'"></span><b>Data as of</b> '+(nStale?nStale+' of '+PCE.PROGRAMS.length+' program pulls missing or older than 3 h':'All program pulls are current')+
    ' <span class="pc-muted">· BT '+(bt?fmtET(bt):'import time unknown')+'</span></summary><div class="pc-srcs">'+srcs+
    '<span class="pc-src'+(bt&&businessDaysSince(bt)>=1?' stale':'')+(bt?'':' miss')+'">BT <i>'+(bt?fmtET(bt):'unknown')+'</i></span></div></details>';
  if(PC.db!=='ready')h+='<div class="pc-banner"><span class="pc-bi">!</span><div><b>Database setup needed.</b> '+es(PC.dbMsg)+' Run <code>sql/precon_tables.sql</code> in Supabase to save uploads for everyone. Until then, uploads work <b>in this browser only</b>.'+(PC.local?' <span class="pc-muted">Showing locally loaded data.</span>':'')+'</div></div>';
  else if(PC.local)h+='<div class="pc-banner"><span class="pc-bi">i</span><div>Showing data loaded in this browser only.</div></div>';
  if(!Object.keys(PC.pulls).length)h+='<div class="pc-empty"><div class="pc-empty-ic">&#8679;</div><b>No program exports loaded yet</b><span>Upload the LC, OC, PIN, RFL, SRQ, PAS and GA exports to build the priority queue.</span><button class="btn btn-primary" onclick="openUploads()">Upload program exports</button></div>';
  // ---- stat cards ----
  const inScope=res.queue;const cnt=k=>inScope.filter(x=>x.priority===k).length;
  h+='<div class="pc-cards">'+[['1','Needs action now','P1 · front end'],['2','Permitting → NTP','P2'],['Watch','Watch','Monitor'],['none','Not our court','Waiting on others']].map(([k,l,s])=>{const on=PC.f.pr.length===1&&PC.f.pr[0]===k;
    return'<button class="pc-card pc-c'+(k==='Watch'?'w':k==='none'?'n':k)+(on?' on':'')+'" onclick="pcCell(\'\',\''+(on?'':k)+'\')"><span class="pc-cl">'+l+'</span><b>'+cnt(k)+'</b><span class="pc-cs">'+s+'</span></button>';}).join('')+'</div>';
  {const pq=inScope.filter(x=>x.program!=='BT');const c=k=>pq.filter(x=>x.priority===k).length;h+='<div class="pc-note2">Program records in scope: <b>'+pq.length+'</b> (P1 '+c('1')+' · P2 '+c('2')+' · Watch '+c('Watch')+' · Not ours '+c('none')+') · BT-only jobs: <b>'+(inScope.length-pq.length)+'</b></div>';}
  const progs=[...PCE.PROGRAMS,'BT'];
  // ---- filter bar ----
  const stages=[...new Set(inScope.map(x=>x.stage).filter(Boolean))].sort((a,b)=>PCE.STAGE_ORDER.indexOf(a)-PCE.STAGE_ORDER.indexOf(b));
  const who=[...new Set(inScope.flatMap(x=>[x.superintendent,x.cm]).filter(Boolean))].sort();
  const fc=(k,v,l)=>'<button class="pc-f'+(PC.f[k].includes(v)?' on':'')+'" onclick="pcToggle(\''+k+'\',\''+es(v)+'\')">'+es(l||v)+'</button>';
  const nF=PC.f.p.length+PC.f.pr.length+PC.f.st.length+(PC.f.who?1:0)+(PC.f.q?1:0);
  h+='<div class="pc-filters" id="pc-queue"><div class="pc-frow"><div class="pc-search"><span>&#9906;</span><input type="search" placeholder="Search address, ID, applicant…" value="'+es(PC.f.q)+'" onchange="pcSet(\'q\',this.value)"></div>'+
    '<div class="pc-seg">'+progs.map(p=>fc('p',p,p==='BT'?'BT-only':p)).join('')+'</div>'+
    '<select onchange="pcSet(\'who\',this.value)"><option value="">All supers / CMs</option>'+who.map(w=>'<option'+(w===PC.f.who?' selected':'')+'>'+es(w)+'</option>').join('')+'</select>'+
    (nF?'<button class="pc-clear" onclick="pcClear()">Clear '+nF+' filter'+(nF>1?'s':'')+' &#10005;</button>':'')+'</div>'+
    '<details class="pc-more"'+(PC.f.pr.length||PC.f.st.length||PC.opts.showHold||PC.opts.phase4?' open':'')+'><summary>More filters</summary><div class="pc-frow"><span class="pc-fl">Priority</span><div class="pc-seg">'+['1','2','Watch','none'].map(k=>fc('pr',k,PRI_LABEL[k])).join('')+'</div></div>'+
    '<div class="pc-frow"><span class="pc-fl">Stage</span><div class="pc-seg">'+stages.map(s=>fc('st',s)).join('')+'</div></div>'+
    '<div class="pc-frow"><span class="pc-fl">Options</span><label class="pc-sw"><input type="checkbox" '+(PC.opts.showHold?'checked':'')+' onchange="pcOpt(\'showHold\',this.checked)"> Show on-hold</label>'+
    '<label class="pc-sw" title="Also use the newer Buildertrend fields (RFI, septic, ISV scheduled, CE returned, permit kickback, Building Permit dropdown)"><input type="checkbox" '+(PC.opts.phase4?'checked':'')+' onchange="pcOpt(\'phase4\',this.checked)"> Phase 4 BT rules</label></div></details></div>';
  // ---- queue ----
  const fl=filterItems(inScope);const p1=fl.filter(x=>x.priority==='1'),p2=fl.filter(x=>x.priority==='2'),watch=fl.filter(x=>x.priority==='Watch'),none=fl.filter(x=>x.priority==='none');
  const row=(x,i)=>{const t=x.primary;const btn=x.bt&&x.bt.address&&x.bt.address!==x.address?' <span class="pc-sub">· BT: '+es(x.bt.address)+'</span>':'';
    const more=x.hits.length>1?' <a href="#" class="pc-more-a" onclick="pcExpand('+i+');return false">+'+(x.hits.length-1)+' more</a><div id="pc-hits-'+i+'" style="display:none" class="pc-hits">'+x.hits.slice(1).map(hh=>'<div>'+chip(hh.rule.Priority)+' '+es(hh.rule.Action)+' <span class="pc-sub">('+es(hh.fields.join('; '))+')</span></div>').join('')+'</div>':'';
    const days=x.days==null?'<span class="pc-sub">—</span>':'<b>'+(x.days_ge?'≥':'')+x.days+'</b><span class="pc-sub">d</span>';
    return'<tr><td class="pc-pri">'+chip(x.priority)+'</td><td class="pc-act" data-l="Action"><div class="pc-at">'+(t?es(t.rule.Action):'<span class="pc-sub">No action rule</span>')+more+'</div><div class="pc-sub">'+(t?es(t.fields.join('; ')):es(x.scope_value||''))+'</div></td>'+
      '<td data-l="Job"><div class="pc-job">'+es(x.address)+'</div><div class="pc-sub">'+es(x.applicant)+' · '+es(x.record_id)+btn+'</div></td>'+
      '<td data-l="Program"><span class="pc-prog" title="'+es(PCE.PROGRAM_NAMES[x.program]||x.bt_group||'')+'">'+(x.program==='BT'?'BT':x.program)+'</span>'+(x.program==='BT'&&x.bt_group?'<div class="pc-sub">'+es(x.bt_group)+'</div>':'')+'</td>'+
      '<td data-l="Stage"><span class="pc-stage">'+es(x.stage||'—')+'</span></td><td class="pc-days" data-l="Waiting" title="'+es(x.days_basis||'')+'">'+days+'</td>'+
      '<td data-l="Owner">'+(es(x.superintendent)||'<span class="pc-sub">—</span>')+(x.cm?'<div class="pc-sub">CM: '+es(x.cm)+'</div>':x.program_cm?'<div class="pc-sub" title="Program CM">('+es(x.program_cm)+')</div>':'')+'</td>'+
      '<td class="pc-go">'+(x.bt?'<a href="#" onclick="pcOpenJob(\''+es(String(x.bt.address).replace(/'/g,"\\'"))+'\');return false">Open &#8250;</a>':'')+'</td></tr>';};
  const tbl=(items,off,empty)=>items.length?'<div class="pc-tw"><table class="pc-q pc-ql"><thead><tr><th></th><th>Action</th><th>Job</th><th>Program</th><th>Stage</th><th>Waiting</th><th>Owner</th><th></th></tr></thead><tbody>'+items.map((x,i)=>row(x,i+off)).join('')+'</tbody></table></div>'
    :'<table class="pc-q pc-ql"><tbody><tr><td colspan="8"><div class="pc-none">'+empty+'</div></td></tr></tbody></table>';
  const sec=(cls,title,sub,n,body)=>'<section class="pc-panel '+cls+'"><header><h3>'+title+'</h3><span class="pc-count">'+n+'</span><span class="pc-hsub">'+sub+'</span></header>'+body+'</section>';
  // ---- grouped P1 / P2 sections (display only) ----
  PC.ui=PC.ui||{act:{},open:{}};
  const actOf=x=>x.primary?x.primary.rule.Action:'No action rule';
  const fdt=v=>{if(v==null||v==='')return'';const s=String(v);if(/^\d{4}-\d{2}-\d{2}/.test(s)||/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)){const d=PCE.parseETDate(s)||new Date(s);if(d&&!isNaN(d))return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'numeric',day:'numeric',year:'numeric'}).format(d);}return s;};
  const kv=(l,v)=>(v==null||String(v).trim()==='')?'':'<div class="pc-kv"><span>'+l+'</span><b>'+es(String(v))+'</b></div>';
  const detail=x=>{const j=x.bt||{};const rec=(PC.pulls[x.program]&&PC.pulls[x.program].records.find(r=>String(r.ID)===x.record_id))||null;
    const scopeF=PCE.SCOPE[x.program];
    const rules='<div class="pc-dcol"><h4>Rules hit ('+x.hits.length+')</h4>'+(x.hits.length?x.hits.map(hh=>'<div class="pc-hit">'+chip(hh.rule.Priority)+'<div><b>'+es(hh.rule.Action)+'</b><div class="pc-sub">'+es(hh.fields.join('; '))+' · '+es(hh.rule.Stage||'')+' · rule '+es(hh.rule.RuleID||'')+' ('+es(hh.src||'')+')</div></div></div>').join(''):'<div class="pc-sub">No rule matched.</div>')+'</div>';
    const prog='<div class="pc-dcol"><h4>'+(x.program==='BT'?'Buildertrend job':'Program record · '+x.program)+'</h4>'+
      (x.program!=='BT'?kv(scopeF||'Status',x.scope_value)+(rec?kv('Status updated',fdt(rec['Status Updated']))+(x.primary&&x.primary.src==='program'&&x.primary.field!==scopeF?kv(x.primary.field,rec[x.primary.field]):''):'')+kv('Record ID',x.record_id)+kv('Matched to BT by',x.match==='id'?'ID':x.match):kv('Group',x.bt_group)+kv('Prefix',x.record_id))+
      kv('Days waiting',x.days==null?'':(x.days_ge?'≥ ':'')+x.days+' (from '+(x.days_basis||'?')+')')+
      '<h4>People</h4>'+kv('Superintendent',x.superintendent)+kv('CM',x.cm)+kv('Program CM',x.program_cm)+'</div>';
    const btc=x.bt?'<div class="pc-dcol"><h4>BT status</h4>'+kv('Job status',j.jobStatus)+kv('Stage',j.constructionStage)+kv('Permit status',j.permitStatus)+kv('Building permit',j.bldgPermitStatus)+
      '<h4>Pre-con fields</h4>'+kv('ISV scheduled',fdt(j.isvScheduled))+kv('ISV completed',fdt(j.isvCompleted))+kv('CE submitted',fdt(j.costEstimateSubmitted))+kv('CE returned',fdt(j.ceReturned))+kv('CE resubmitted',fdt(j.ceResubmitted))+kv('CE approved',fdt(j.costEstimateApproved))+
      kv('Permit submitted',fdt(j.bldgPermitSubmitted))+kv('Permit kicked back',fdt(j.permitKickedBack))+kv('Permit issued',fdt(j.bldgPermitIssued))+kv('NTP',fdt(j.ntp))+
      kv('RFI needed',j.rfiNeeded)+kv('RFI requested',fdt(j.rfiRequested))+kv('RFI received',fdt(j.rfiReceived))+kv('Septic',j.septic)+kv('Sewer type',j.sewerType)+kv('Septic permit issued',fdt(j.septicPermitIssued))+
      kv('Pre-con mtg scheduled',fdt(j.preConMeetingScheduled))+kv('Pre-con mtg completed',fdt(j.preConMeetingCompleted))+'</div>':'<div class="pc-dcol"><h4>BT status</h4><div class="pc-sub">No matching Buildertrend job.</div></div>';
    const cc=j.companyCamLink&&/^https?:\/\//i.test(String(j.companyCamLink).trim())?String(j.companyCamLink).trim():'';
    const links='<div class="pc-dlinks">'+(x.bt?'<a href="#" onclick="pcOpenJob(\''+es(String(x.bt.address).replace(/'/g,"\\'"))+'\');return false">Open in Tracker &#8250;</a>':'')+(cc?'<a href="'+es(cc)+'" target="_blank" rel="noopener">CompanyCam &#8599;</a>':'<span class="pc-sub">No CompanyCam link</span>')+
      '<a href="#" onclick="navigator.clipboard&&navigator.clipboard.writeText(\''+es(x.record_id).replace(/'/g,"\\'")+'\');this.textContent=\'Copied ✓\';return false">Copy '+(x.program==='BT'?'prefix':'program ID')+' '+es(x.record_id)+'</a><span class="pc-sub">The program exports don\'t include record links.</span></div>';
    return'<div class="pc-dgrid">'+rules+prog+btc+'</div>'+links;};
  const grow=(x,i)=>{const t=x.primary;const open=!!PC.ui.open[x.job_key];
    const days=x.days==null?'<span class="pc-sub">—</span>':'<b>'+(x.days_ge?'≥':'')+x.days+'</b><span class="pc-sub">d</span>';
    return'<tr class="pc-r'+(open?' open':'')+'" onclick="pcRow(this,\''+es(x.job_key).replace(/'/g,"\\'")+'\')"><td class="pc-pri"><span class="pc-tw-ic">&#8250;</span></td><td class="pc-act" data-l="Action"><div class="pc-at">'+es(t?t.rule.Action:'No action rule')+(x.hits.length>1?' <span class="pc-nr">+'+(x.hits.length-1)+'</span>':'')+'</div><div class="pc-sub">'+(t?es(t.fields.join('; ')):es(x.scope_value||''))+'</div></td>'+
      '<td data-l="Job"><div class="pc-job">'+es(x.address)+'</div><div class="pc-sub">'+es(x.applicant)+' · '+es(x.record_id)+(x.bt&&x.bt.address&&x.bt.address!==x.address?' · BT: '+es(x.bt.address):'')+'</div></td>'+
      '<td data-l="Program"><span class="pc-prog" title="'+es(PCE.PROGRAM_NAMES[x.program]||x.bt_group||'')+'">'+x.program+'</span></td>'+
      '<td data-l="Stage"><span class="pc-stage">'+es(x.stage||'—')+'</span></td><td class="pc-days" data-l="Waiting" title="'+es(x.days_basis||'')+'">'+days+'</td>'+
      '<td data-l="Owner">'+(es(x.superintendent)||'<span class="pc-sub">—</span>')+(x.cm?'<div class="pc-sub">CM: '+es(x.cm)+'</div>':'')+'</td>'+
      '<td class="pc-go">'+(x.bt?'<a href="#" onclick="event.stopPropagation();pcOpenJob(\''+es(String(x.bt.address).replace(/'/g,"\\'"))+'\');return false">Open &#8250;</a>':'')+'</td></tr>'+
      '<tr class="pc-det"'+(open?'':' hidden')+'><td colspan="8">'+(open?detail(x):'')+'</td></tr>';};
  PC._detail=detail;
  const grouped=(key,cls,title,sub,items,emptyMsg)=>{
    const groups={};items.forEach(x=>{const a=actOf(x);(groups[a]=groups[a]||[]).push(x);});
    const order=Object.keys(groups).sort((a,b)=>groups[b].length-groups[a].length||a.localeCompare(b));
    const sel=PC.ui.act[key]||'';
    const own={};items.forEach(x=>{const o=x.superintendent||x.cm||'Unassigned';own[o]=(own[o]||0)+1;});
    const ownO=Object.keys(own).sort((a,b)=>own[b]-own[a]||a.localeCompare(b));
    let b='';
    if(items.length){
      b+='<div class="pc-strip"><span class="pc-sl">By action</span><button class="pc-ac'+(sel?'':' on')+'" onclick="pcAct(\''+key+'\',\'\')">All <b>'+items.length+'</b></button>'+order.map(a=>'<button class="pc-ac'+(sel===a?' on':'')+'" onclick="pcAct(\''+key+'\',\''+es(a).replace(/'/g,"\\'")+'\')">'+es(a)+' <b>'+groups[a].length+'</b></button>').join('')+'</div>';
      b+='<div class="pc-strip"><span class="pc-sl">By owner</span>'+ownO.map(o=>{const on=PC.f.who===o;return'<button class="pc-ac pc-ow'+(on?' on':'')+'" '+(o==='Unassigned'?'disabled title="No superintendent or CM in BT"':'onclick="pcSet(\'who\',\''+(on?'':es(o).replace(/'/g,"\\'"))+'\')"')+'>'+es(o)+' <b>'+own[o]+'</b></button>';}).join('')+'</div>';
      const shown=sel&&groups[sel]?[sel]:order;
      b+='<div class="pc-tw"><table class="pc-q pc-ql pc-gq"><thead><tr><th></th><th>Action</th><th>Job</th><th>Program</th><th>Stage</th><th>Waiting</th><th>Owner</th><th></th></tr></thead>'+shown.map((a,gi)=>{
        const g=groups[a].slice().sort((p,q)=>((q.days==null?-1:q.days)-(p.days==null?-1:p.days))||p.address.localeCompare(q.address));
        const bp={};g.forEach(x=>{bp[x.program]=(bp[x.program]||0)+1;});const old=Math.max(...g.map(x=>x.days==null?-1:x.days));
        return'<tbody class="pc-grp"><tr class="pc-gh"><td colspan="8"><div class="pc-ghi"><span class="pc-gt">'+es(a)+'</span><span class="pc-count">'+g.length+'</span><span class="pc-gm">'+Object.keys(bp).sort((p,q)=>bp[q]-bp[p]).map(p=>p+' '+bp[p]).join(' · ')+'</span>'+(old>=0?'<span class="pc-gold">oldest <b>'+old+'d</b></span>':'')+'</div></td></tr>'+g.map((x,i)=>grow(x,key+gi+'_'+i)).join('')+'</tbody>';}).join('')+'</table></div>';
    }else b+='<table class="pc-q pc-ql"><tbody><tr><td colspan="8"><div class="pc-none">'+emptyMsg+'</div></td></tr></tbody></table>';
    return sec(cls,title,sub,items.length,b);};
  h+=grouped('p1','pc-s1','Needs action now','P1 · front-end items where the ball is in our court',p1,nF?'No P1 items match these filters.':'&#10003; Nothing urgent. No P1 items right now.');
  h+=grouped('p2','pc-s2','Permitting → NTP','P2 · in our court, less urgent',p2,nF?'No P2 items match these filters.':'No P2 items.');
  const fold=(id,title,n,body,sub)=>'<details class="pc-fold" id="'+id+'"><summary><span class="pc-chev">&#8250;</span><h3>'+title+'</h3>'+(n!=null?'<span class="pc-count">'+n+'</span>':'')+(sub?'<span class="pc-hsub">'+sub+'</span>':'')+'</summary><div class="pc-fb">'+body+'</div></details>';
  h+='<div class="pc-folds">';
  h+=fold('pc-f-w','Watch',watch.length,tbl(watch,1000,'Nothing on the watch list.'),'monitor, no action yet');
  h+=fold('pc-f-n','Not our court',none.length,tbl(none,2000,'Nothing here.'),'waiting on program or others');
  // matrix
  h+=fold('pc-f-m','By program',inScope.length,'<div class="pc-tw"><table class="pc-matrix"><thead><tr><th>Program</th><th>P1</th><th>P2</th><th>Watch</th><th>Not ours</th><th>Total</th></tr></thead><tbody>'+progs.map(p=>{const it=inScope.filter(x=>x.program===p);const c=k=>it.filter(x=>x.priority===k).length;
    return'<tr><td title="'+es(PCE.PROGRAM_NAMES[p]||'Buildertrend-only jobs')+'"><b>'+(p==='BT'?'BT-only':p)+'</b> <span class="pc-sub">'+es(PCE.PROGRAM_NAMES[p]||'Buildertrend only')+'</span></td>'+['1','2','Watch','none'].map(k=>'<td class="pc-cell'+(c(k)?' k'+(k==='Watch'?'w':k==='none'?'n':k):' z')+'" onclick="pcCell(\''+p+'\',\''+k+'\')">'+c(k)+'</td>').join('')+'<td class="pc-cell" onclick="pcCell(\''+p+'\',\'\')"><b>'+it.length+'</b></td></tr>';}).join('')+
    '<tr class="pc-tot"><td>Total</td>'+['1','2','Watch','none'].map(k=>'<td>'+cnt(k)+'</td>').join('')+'<td>'+inScope.length+'</td></tr></tbody></table></div><div class="pc-sub" style="margin-top:8px">Click a number to filter the queue.</div>','program × priority');
  // recent changes
  const wk=now-7*86400000;const scopeKeys=new Set(inScope.map(x=>x.program+'|'+x.record_id));
  let ch=PC.changes.filter(c=>new Date(c.changed_at).getTime()>=wk&&scopeKeys.has(c.program+'|'+c.record_id));
  const qk=new Set(fl.map(x=>x.program+'|'+x.record_id));ch=ch.filter(c=>qk.has(c.program+'|'+c.record_id));
  ch=ch.map(c=>{const nowY=c.field!=='(record)'&&PCE.ourCourt(R,c.program,c.field,c.new_value);const wasY=c.old_value!=='(unknown)'&&PCE.ourCourt(R,c.program,c.field,c.old_value);return{...c,nowY,entered:nowY&&!wasY};});
  if(PC.chg.our)ch=ch.filter(c=>c.nowY);if(PC.chg.entered)ch=ch.filter(c=>c.entered);
  ch.sort((a,b)=>String(b.changed_at).localeCompare(String(a.changed_at)));
  h+=fold('pc-f-c','Recent changes',ch.length,'<div class="pc-frow" style="margin-bottom:10px"><label class="pc-sw"><input type="checkbox" '+(PC.chg.our?'checked':'')+' onchange="pcChg(\'our\',this.checked)"> Now in our court</label><label class="pc-sw"><input type="checkbox" '+(PC.chg.entered?'checked':'')+' onchange="pcChg(\'entered\',this.checked)"> Entered our court</label></div>'+
    (ch.length?'<div class="pc-tw pc-scroll"><table class="pc-q"><thead><tr><th>Changed (ET)</th><th>Program</th><th>ID</th><th>Address</th><th>Applicant</th><th>Field</th><th>Old → New</th><th>Our court</th><th>Source</th></tr></thead><tbody>'+ch.slice(0,300).map(c=>'<tr><td class="pc-nw">'+(c.changed_at_precision==='detected'?'≤ ':'')+fmtET(c.changed_at)+'</td><td><span class="pc-prog">'+c.program+'</span></td><td class="pc-nw">'+es(c.record_id)+'</td><td>'+es(c.address)+'</td><td>'+es(c.applicant)+'</td><td>'+es(c.field)+'</td><td><span class="pc-sub">'+es(c.old_value)+'</span> → <b>'+es(c.new_value)+'</b></td><td>'+(c.entered?'<span class="pc-chip pc-p1">Entered</span>':c.nowY?'Yes':'')+'</td><td class="pc-sub">'+es(c.source)+'</td></tr>').join('')+'</tbody></table></div>'
      :'<div class="pc-none">No changes in the last 7 days. Changes appear after a second pull of the same program, or from “Updated” dates on the first pull.</div>'),'last 7 days, pre-con scope');
  // gaps
  const g=res.gaps;const um=Object.entries(g.unmapped).map(([k,n])=>{const[p,f,v]=k.split('|');return{p,f,v,n};}).sort((a,b)=>b.n-a.n);
  const gl=(t,arr,fn)=>'<details class="pc-gap"><summary><span>'+t+'</span> <b class="'+(arr.length?'':'z')+'">('+arr.length+')</b></summary><div class="pc-gl">'+(arr.length?arr.slice(0,300).map(fn).join(''):'<div class="pc-sub">None</div>')+'</div></details>';
  const idf=x=>'<div>'+x.program+' · '+es(x.id)+' · '+es(x.address||'')+'</div>';
  const gTot=g.unknownRfi.length+g.unknownSeptic.length+g.unmatched.length+g.ambiguous.length+g.stageMismatch.length+um.length+g.missingFields.length;
  h+=fold('pc-f-g','Data gaps',gTot,'<div class="pc-gaps">'+
    gl('Unknown RFI',g.unknownRfi,idf)+gl('Unknown septic',g.unknownSeptic,x=>'<div>'+x.program+' · '+es(x.id)+' · '+es(x.address)+' · <i>'+es(x.septic||'blank')+'</i></div>')+
    gl('Unmatched (no BT job by case # or address)',g.unmatched,x=>'<div>'+x.program+' · '+es(x.id)+' · '+es(x.address||'')+' · '+es(x.applicant||'')+'</div>')+
    gl('Ambiguous matches',g.ambiguous,idf)+gl('Stage mismatch (program pre-con, BT 20+)',g.stageMismatch,x=>'<div>'+x.program+' · '+es(x.id)+' · '+es(x.address)+' · '+es(x.program_value)+' vs BT '+es(x.bt_status)+'</div>')+
    gl('Unmapped values',um,x=>'<div>'+x.p+' · '+es(x.f)+' = <b>'+es(x.v)+'</b> ('+x.n+')</div>')+gl('Missing fields',g.missingFields,x=>'<div>'+x.program+' · '+es(x.field)+'</div>')+'</div>','matching & data quality');
  h+=fold('pc-f-r','Rules',PC.rules.length,'<div class="pc-frow"><span class="pc-sub">The queue is driven by '+PC.rules.length+' status → priority rules ('+(PC.rulesSource==='seed'?'bundled seed':'Supabase')+'). Read-only.</span><button class="btn btn-ol pc-ol" onclick="openPcRules()">View rules</button></div>','read-only');
  h+='</div>';
  const op=[...body.querySelectorAll('details[id]')].filter(d=>d.open).map(d=>d.id),mo=body.querySelector('.pc-more')?.open,ao=body.querySelector('.pc-asof')?.open;
  body.innerHTML=h;
  op.forEach(id=>{const d=document.getElementById(id);if(d)d.open=true;});if(mo)body.querySelector('.pc-more').open=true;if(ao)body.querySelector('.pc-asof').open=true;
};
window.openPcRules=function(){const q=(document.getElementById('pcr-q')||{}).value||'';const rs=PC.rules.filter(r=>!q||Object.values(r).join(' ').toLowerCase().includes(q.toLowerCase()));
  document.getElementById('pcr-meta').textContent=PC.rules.length+' rules · source: '+(PC.rulesSource==='seed'?'bundled seed (precon_rules_seed.js)':'Supabase precon_rules');
  document.getElementById('pcr-list').innerHTML='<table class="pc-q"><thead><tr><th>ID</th><th>Program</th><th>Field</th><th>Value</th><th>Match</th><th>Our court</th><th>Pri</th><th>Action</th><th>Stage</th><th>Source</th><th>Active</th><th>Notes</th></tr></thead><tbody>'+rs.map(r=>'<tr'+(r.Active==='N'?' class="pc-off"':'')+'><td>'+es(r.RuleID)+'</td><td>'+es(r.Program)+'</td><td>'+es(r.Field)+'</td><td>'+es(r.Value)+'</td><td>'+es(r.MatchType)+'</td><td>'+es(r.OurCourt)+'</td><td>'+es(r.Priority)+'</td><td>'+es(r.Action)+'</td><td>'+es(r.Stage)+'</td><td>'+es(r.Source)+'</td><td>'+es(r.Active)+'</td><td>'+es(r.Notes)+'</td></tr>').join('')+'</tbody></table>';
  document.getElementById('pcr-modal').classList.add('open');};
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('#hdr-views button');if(b&&b.id!=='pc-view-btn')closePrecon();},true);
window.closePcRules=()=>document.getElementById('pcr-modal').classList.remove('open');
})();
