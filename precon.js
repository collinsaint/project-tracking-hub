// Pre-Con Priority dashboard: program-export upload, storage, and the #precon page.
// Depends on precon_engine.js (PCE), precon_rules_seed.js, and globals from index.html
// (sb, proj, es, st2, reportFail, openProjectByAddr, goToTracker, setViewHash, filterProj).
(function(){
const PC={rules:window.PRECON_RULES_SEED||[],rulesSource:'seed',db:'unknown',dbMsg:'',pulls:{},prev:{},changes:[],local:false,
  opts:{phase4:false,showHold:false},f:{p:[],pr:[],st:[],who:'',q:''},chg:{our:false,entered:false},result:null,loaded:false,uploads:[]};
window.PC=PC;
const LS_KEY='pic_precon_local_v1';
const pn=c=>(PCE.PROGRAM_NAMES&&PCE.PROGRAM_NAMES[c])||c;
const T={pulls:'precon_pulls',recs:'precon_program_records',log:'precon_change_log',rules:'precon_rules'};
const isMissing=e=>e&&(e.code==='42P01'||e.code==='PGRST205'||/does not exist|could not find the table|schema cache/i.test(e.message||''));
const fmtET=d=>{if(!d)return'—';const x=d instanceof Date?d:new Date(d);if(isNaN(x))return'—';return x.toLocaleString('en-US',{timeZone:'America/New_York',month:'numeric',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})+' ET';};
const fmtDate=d=>{const x=new Date(d);return isNaN(x)?'':x.toLocaleDateString('en-US',{timeZone:'America/New_York',month:'2-digit',day:'2-digit',year:'numeric'});};
const PRI_LABEL={'1':'P1','2':'P2','Watch':'Watch','none':'Not ours'};
// Withdrawn jobs (00A status, any 'withdrawn' status, or a '(withdrawn)' program) never count anywhere.
const isWithdrawn=j=>/withdrawn/i.test(String(j&&j.jobStatus||''))||/withdrawn/i.test(String(j&&j.program||''));
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
  const one={};one[p]=pull;const after=PCE.evaluate(Object.assign({},PC.pulls,one),btJobs(),PC.rules,{excludeJob:isWithdrawn,phase4:PC.opts.phase4});
  const before=cur?PCE.evaluate(PC.pulls,btJobs(),PC.rules,{excludeJob:isWithdrawn,phase4:PC.opts.phase4}):null;
  const cnt=res=>{const c={'1':0,'2':0,'Watch':0,'none':0};if(res)res.queue.filter(q=>q.program===p).forEach(q=>c[q.priority]++);return c;};
  const changes=block?[]:PCE.diffPulls(p,cur||null,pull,(cur?cur.meta.file_name+' -> ':'')+u.name);
  return{pull,missLead,ruleF,newCols,goneCols,block,stats:after.stats[p],before:cnt(before),after:cnt(after),changes};
}
function renderUploadPreview(){
  const list=document.getElementById('pcu-list');
  if(!PC.uploads.length){list.innerHTML='';return;}
  const opts=PCE.PROGRAMS.map(p=>'<option value="'+p+'">'+PCE.PROGRAM_NAMES[p]+'</option>').join('');
  const newest={};PC.uploads.forEach(u=>{if(u.program&&!u.error&&(!newest[u.program]||u.pullAt>newest[u.program].pullAt))newest[u.program]=u;});
  list.innerHTML=PC.uploads.map((u,i)=>{
    if(u.error)return'<div class="pcu-file err"><b>'+es(u.name)+'</b><div>Could not read file: '+es(u.error)+'</div></div>';
    const a=u._a=uploadAnalysis(u);if(newest[u.program]&&newest[u.program]!==u&&!a.block)a.block='A newer '+pn(u.program)+' file is in this upload ('+newest[u.program].name+'); only the newest is used.';
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
  try{mobileNavSet('precon');}catch(e){}
  history.replaceState(null,'',_h&&_h.startsWith('#precon')?_h:'#precon');readHash();const v=document.getElementById('pc-view');v.classList.add('open');writeHash();
  document.getElementById('pc-view-btn')?.classList.add('active-view');document.getElementById('tracker-home-btn')?.classList.remove('active-view');
  if(!PC.loaded){document.getElementById('pc-body').innerHTML='<div class="pc-muted" style="padding:30px">Loading pre-con data…</div>';if(!PC._loading)PC._loading=dbLoad();await PC._loading;PC.loaded=true;}
  renderPrecon();};
window.closePrecon=function(){window.pcDrawerClose&&pcDrawerClose();const v=document.getElementById('pc-view');if(!v||!v.classList.contains('open'))return;v.classList.remove('open');document.getElementById('pc-view-btn')?.classList.remove('active-view');};
window.pcToggle=(k,v)=>{const a=PC.f[k];const i=a.indexOf(v);if(i>=0)a.splice(i,1);else a.push(v);writeHash();renderPrecon();};
window.pcSet=(k,v)=>{PC.f[k]=v;writeHash();renderPrecon();};
window.pcOpt=(k,v)=>{PC.opts[k]=v;writeHash();renderPrecon();};
window.pcCell=(p,pr)=>{PC.f.p=p?[p]:[];PC.f.pr=pr?[pr]:[];writeHash();renderPrecon();document.getElementById('pc-queue')?.scrollIntoView({behavior:'smooth'});};
window.pcClear=()=>{PC.f={p:[],pr:[],st:[],who:'',q:''};writeHash();renderPrecon();};
window.pcChg=(k,v)=>{PC.chg[k]=v;renderPrecon();};
window.pcOpenJob=addr=>{closePrecon();goToTracker();if(typeof openProjectByAddr==='function')openProjectByAddr(addr);};
window.pcAct=(k,v)=>{PC.ui=PC.ui||{act:{},open:{}};PC.ui.act[k]=v;renderPrecon();};
window.pcDrawer=key=>{const x=(PC.result.queue||[]).find(q=>q.job_key===key);if(!x)return;const d=document.getElementById('pc-drawer');const t=x.primary;
  d.querySelector('.pcd-h').innerHTML='<div><div class="pcd-t">'+es(x.address)+'</div><div class="pcd-s"><span class="pc-prog">'+pn(x.program)+'</span>'+es(t?t.rule.Action:'')+(x.days!=null?' · '+(x.days_ge?'≥':'')+x.days+'d':'')+'</div></div><button class="pc-x" onclick="pcDrawerClose()" aria-label="Close">&#10005;</button>';
  d.querySelector('.pcd-b').innerHTML=PC._detail(x);d.querySelector('.pcd-b').scrollTop=0;document.getElementById('pc-dwrap').classList.add('open');};
window.pcCal=(op,v)=>{const c=PC.ui.cal;const[y,m,d]=c.anchor.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d,12));const k=x=>x.toISOString().slice(0,10);
  if(op==='mode')c.mode=v;else if(op==='today'){c.anchor=k(new Date());c.day='';}else if(op==='day')c.day=c.day===v?'':v;else{const s=op==='next'?1:-1;if(c.mode==='month'){dt.setUTCDate(1);dt.setUTCMonth(dt.getUTCMonth()+s);}else dt.setUTCDate(dt.getUTCDate()+7*s);c.anchor=k(dt);c.day='';}renderPrecon();};
window.pcDrawerClose=()=>document.getElementById('pc-dwrap').classList.remove('open');
document.addEventListener('keydown',e=>{if(e.key==='Escape')pcDrawerClose();});
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
  let res;try{res=PCE.evaluate(PC.pulls,btJobs(),PC.rules,{excludeJob:isWithdrawn,phase4:PC.opts.phase4,showHold:PC.opts.showHold,changes:PC.changes,activeFilter:true});}catch(e){reportFail('Pre-Con dashboard',e);return;}
  // BT-only jobs must still be active in the hub (no withdrawn / Volusia)
  const act=new Set(btActive().map(j=>j.address));res.queue=res.queue.filter(x=>x.program!=='BT'||act.has(x.address));
  PC.result=res;const now=Date.now();
  // ---- header: data freshness ----
  const srcs=PCE.PROGRAMS.map(p=>{const pl=PC.pulls[p];if(!pl)return'<span class="pc-src miss" title="No pull uploaded">'+pn(p)+' <i>none</i></span>';
    const stale=now-new Date(pl.meta.pull_at).getTime()>3*3600000;return'<span class="pc-src'+(stale?' stale':'')+'" title="'+es(pl.meta.file_name||'')+'">'+pn(p)+' <i>'+fmtET(pl.meta.pull_at)+'</i></span>';}).join('');
  const bt=localStorage.getItem('pic_bt_import_at');
  const nStale=PCE.PROGRAMS.filter(p=>!PC.pulls[p]||now-new Date(PC.pulls[p].meta.pull_at).getTime()>3*3600000).length;
  let h='<details class="pc-asof"><summary><span class="pc-dot '+(nStale?'warn':'ok')+'"></span><b>Data as of</b> '+(nStale?nStale+' of '+PCE.PROGRAMS.length+' program pulls missing or older than 3 h':'All program pulls are current')+
    ' <span class="pc-muted">· BT '+(bt?fmtET(bt):'import time unknown')+'</span></summary><div class="pc-srcs">'+srcs+
    '<span class="pc-src'+(bt&&businessDaysSince(bt)>=1?' stale':'')+(bt?'':' miss')+'">BT <i>'+(bt?fmtET(bt):'unknown')+'</i></span></div></details>';
  if(PC.db!=='ready')h+='<div class="pc-banner"><span class="pc-bi">!</span><div><b>Database setup needed.</b> '+es(PC.dbMsg)+' Run <code>sql/precon_tables.sql</code> in Supabase to save uploads for everyone. Until then, uploads work <b>in this browser only</b>.'+(PC.local?' <span class="pc-muted">Showing locally loaded data.</span>':'')+'</div></div>';
  else if(PC.local)h+='<div class="pc-banner"><span class="pc-bi">i</span><div>Showing data loaded in this browser only.</div></div>';
  if(!Object.keys(PC.pulls).length)h+='<div class="pc-empty"><div class="pc-empty-ic">&#8679;</div><b>No program exports loaded yet</b><span>Upload the Lee Cares, Orange County, Pinellas Recovers, RebuildFL, ResilientSRQ, Pasco Better Future and Georgia HRRP exports to build the priority queue.</span><button class="btn btn-primary" onclick="openUploads()">Upload program exports</button></div>';
  // ---- stat cards (hero) ----
  const inScope=res.queue;const cnt=k=>inScope.filter(x=>x.priority===k).length;
  const oldestOf=k=>{const d=inScope.filter(x=>x.priority===k&&x.days!=null).map(x=>x.days);return d.length?Math.max(...d):null;};
  const wk7=now-7*86400000;const newIn=k=>inScope.filter(x=>x.priority===k&&x.days!=null&&x.days<=7).length;
  h+='<div class="pc-cards">'+[['1','Needs action now'],['2','Permitting → NTP'],['Watch','Watch'],['none','Not our court']].map(([k,l])=>{const on=PC.f.pr.length===1&&PC.f.pr[0]===k;const o=oldestOf(k);const n=newIn(k);
    return'<button class="pc-card pc-c'+(k==='Watch'?'w':k==='none'?'n':k)+(on?' on':'')+'" onclick="pcCell(\'\',\''+(on?'':k)+'\')"><span class="pc-cl">'+l+'</span><b>'+cnt(k)+'</b><span class="pc-cs">'+(n?'+'+n+' this week':'&nbsp;')+(o!=null?' · oldest '+o+'d':'')+'</span></button>';}).join('')+'</div>';
  {const pq=inScope.filter(x=>x.program!=='BT');const c=k=>pq.filter(x=>x.priority===k).length;h+='<div class="pc-note2">Program records in scope: <b>'+pq.length+'</b> (P1 '+c('1')+' · P2 '+c('2')+' · Watch '+c('Watch')+' · Not ours '+c('none')+') · BT-only jobs: <b>'+(inScope.length-pq.length)+'</b></div>';}
  const progs=[...PCE.PROGRAMS,'BT'];
  // ---- filter bar ----
  const stages=[...new Set(inScope.map(x=>x.stage).filter(Boolean))].sort((a,b)=>PCE.STAGE_ORDER.indexOf(a)-PCE.STAGE_ORDER.indexOf(b));
  const who=[...new Set(inScope.flatMap(x=>[x.superintendent,x.cm]).filter(Boolean))].sort();
  const fc=(k,v,l)=>'<button class="pc-f'+(PC.f[k].includes(v)?' on':'')+'" onclick="pcToggle(\''+k+'\',\''+es(v)+'\')">'+es(l||v)+'</button>';
  const nF=PC.f.p.length+PC.f.pr.length+PC.f.st.length+(PC.f.who?1:0)+(PC.f.q?1:0);
  h+='<div class="pc-filters" id="pc-queue"><div class="pc-frow"><div class="pc-search"><span>&#9906;</span><input type="search" placeholder="Search address, ID, applicant…" value="'+es(PC.f.q)+'" onchange="pcSet(\'q\',this.value)"></div>'+
    '<div class="pc-seg">'+progs.map(p=>fc('p',p,pn(p))).join('')+'</div>'+
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
      '<td data-l="Program"><span class="pc-prog" title="'+es(PCE.PROGRAM_NAMES[x.program]||x.bt_group||'')+'">'+(x.program==='BT'?'BT':pn(x.program))+'</span>'+(x.program==='BT'&&x.bt_group?'<div class="pc-sub">'+es(x.bt_group)+'</div>':'')+'</td>'+
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
    const rules='<div class="pc-dcol"><h4>'+(x.hits.length>1?'Actions ('+x.hits.length+')':'Action')+'</h4>'+(x.hits.length?x.hits.map(hh=>'<div class="pc-hit">'+chip(hh.rule.Priority)+'<div><b>'+es(hh.rule.Action)+'</b><div class="pc-sub">'+es(hh.fields.join('; '))+'</div></div></div>').join(''):'<div class="pc-sub">No rule matched.</div>')+'</div>';
    const prog='<div class="pc-dcol"><h4>'+(x.program==='BT'?'Buildertrend job':'Program record · '+pn(x.program))+'</h4>'+
      (x.program!=='BT'?kv(scopeF||'Status',x.scope_value)+(rec?kv('Status updated',fdt(rec['Status Updated']))+(x.primary&&x.primary.src==='program'&&x.primary.field!==scopeF?kv(x.primary.field,rec[x.primary.field]):''):'')+kv('Record ID',x.record_id)+kv('Matched to BT by',x.match==='id'?'ID':x.match):kv('Group',x.bt_group)+kv('Prefix',x.record_id))+
      kv('Days waiting',x.days==null?'':(x.days_ge?'≥ ':'')+x.days)+
      '<h4>People</h4>'+kv('Superintendent',x.superintendent)+kv('CM',x.cm)+kv('Program CM',x.program_cm)+'</div>';
    const btc=x.bt?'<div class="pc-dcol"><h4>BT status</h4>'+kv('Job status',j.jobStatus)+kv('Stage',j.constructionStage)+kv('Permit status',j.permitStatus)+kv('Building permit',j.bldgPermitStatus)+
      '<h4>Pre-con fields</h4>'+kv('ISV scheduled',fdt(j.isvScheduled))+kv('ISV completed',fdt(j.isvCompleted))+kv('CE submitted',fdt(j.costEstimateSubmitted))+kv('CE returned',fdt(j.ceReturned))+kv('CE resubmitted',fdt(j.ceResubmitted))+kv('CE approved',fdt(j.costEstimateApproved))+
      kv('Permit submitted',fdt(j.bldgPermitSubmitted))+kv('Permit kicked back',fdt(j.permitKickedBack))+kv('Permit issued',fdt(j.bldgPermitIssued))+kv('NTP',fdt(j.ntp))+
      kv('RFI needed',j.rfiNeeded)+kv('RFI requested',fdt(j.rfiRequested))+kv('RFI received',fdt(j.rfiReceived))+kv('Septic',j.septic)+kv('Sewer type',j.sewerType)+kv('Septic permit issued',fdt(j.septicPermitIssued))+
      kv('Pre-con mtg scheduled',fdt(j.preConMeetingScheduled))+kv('Pre-con mtg completed',fdt(j.preConMeetingCompleted))+'</div>':'<div class="pc-dcol"><h4>BT status</h4><div class="pc-sub">No matching Buildertrend job.</div></div>';
    const cc=j.companyCamLink&&/^https?:\/\//i.test(String(j.companyCamLink).trim())?String(j.companyCamLink).trim():'';
    const links='<div class="pc-dlinks">'+(x.bt?'<a href="#" onclick="pcOpenJob(\''+es(String(x.bt.address).replace(/'/g,"\\'"))+'\');return false">Open in Tracker &#8250;</a>':'')+(cc?'<a href="'+es(cc)+'" target="_blank" rel="noopener">CompanyCam &#8599;</a>':'')+
      '<a href="#" onclick="navigator.clipboard&&navigator.clipboard.writeText(\''+es(x.record_id).replace(/'/g,"\\'")+'\');this.textContent=\'Copied ✓\';return false">Copy '+(x.program==='BT'?'prefix':'program ID')+' '+es(x.record_id)+'</a></div>';
    return'<div class="pc-dgrid">'+rules+prog+btc+'</div>'+links;};
  PC._detail=detail;
  const COL={'1':'#ef4444','2':'#f59e0b','Watch':'#3b82f6','none':'#94a3b8'};
  const empty=m=>'<div class="pc-none">'+m+'</div>';
  const jl=(arr)=>'<ul class="pc-list">'+arr.slice().sort((p,q)=>((q.days==null?-1:q.days)-(p.days==null?-1:p.days))||p.address.localeCompare(q.address)).map(x=>'<li onclick="pcDrawer(\''+es(x.job_key).replace(/'/g,"\\'")+'\')"><i class="pc-ldot" style="background:'+COL[x.priority]+'"></i><span class="pc-la">'+es(x.address)+'</span><span class="pc-prog">'+pn(x.program)+'</span><span class="pc-ld">'+(x.days==null?'—':(x.days_ge?'≥':'')+x.days+'d')+'</span><span class="pc-lo">&#8250;</span></li>').join('')+'</ul>';
  const ours=[...p1,...p2];
  // donut
  const tot=fl.length;let acc=0;const RD=52,C=2*Math.PI*RD;
  const segs=['1','2','Watch','none'].map(k=>{const n=fl.filter(x=>x.priority===k).length;const len=tot?C*n/tot:0;const s='<circle r="'+RD+'" cx="70" cy="70" fill="none" stroke="'+COL[k]+'" stroke-width="20" stroke-dasharray="'+Math.max(len-2,0)+' '+(C-Math.max(len-2,0))+'" stroke-dashoffset="'+(-acc)+'" transform="rotate(-90 70 70)" style="cursor:pointer" onclick="pcCell(\'\',\''+k+'\')"><title>'+PRI_LABEL[k]+': '+n+'</title></circle>';acc+=len;return s;}).join('');
  const donut='<div class="pc-chart pc-donut"><h4>Priority split</h4><div class="pc-dn"><svg viewBox="0 0 140 140" width="140" height="140"><circle r="'+RD+'" cx="70" cy="70" fill="none" stroke="#f1f5f9" stroke-width="20"/>'+segs+'<text x="70" y="68" text-anchor="middle" class="pc-dnn">'+tot+'</text><text x="70" y="86" text-anchor="middle" class="pc-dnl">jobs</text></svg><div class="pc-leg">'+['1','2','Watch','none'].map(k=>'<div><i style="background:'+COL[k]+'"></i>'+PRI_LABEL[k]+'<b>'+fl.filter(x=>x.priority===k).length+'</b></div>').join('')+'</div></div></div>';
  // aging (P1+P2)
  const B=[['0–7d',0,7],['8–14d',8,14],['15–30d',15,30],['30d+',31,1e9]];const bc=B.map(([l,a,b])=>({l,p1:p1.filter(x=>x.days!=null&&x.days>=a&&x.days<=b).length,p2:p2.filter(x=>x.days!=null&&x.days>=a&&x.days<=b).length}));
  const bm=Math.max(1,...bc.map(b=>b.p1+b.p2));const unk=ours.filter(x=>x.days==null).length;
  const aging='<div class="pc-chart"><h4>Days waiting <span>P1 + P2</span></h4><div class="pc-age">'+bc.map(b=>'<div class="pc-ab"><div class="pc-abar"><div style="height:'+(b.p2/bm*100)+'%;background:'+COL['2']+'"></div><div style="height:'+(b.p1/bm*100)+'%;background:'+COL['1']+'"></div></div><b>'+(b.p1+b.p2)+'</b><span>'+b.l+'</span></div>').join('')+'</div>'+(unk?'<div class="pc-cfoot">'+unk+' without a status date</div>':'')+'</div>';
  // actions bar chart
  const groups={};ours.forEach(x=>{const a=actOf(x);(groups[a]=groups[a]||{p1:[],p2:[]})[x.priority==='1'?'p1':'p2'].push(x);});
  const order=Object.keys(groups).sort((a,b)=>(groups[b].p1.length-groups[a].p1.length)||((groups[b].p1.length+groups[b].p2.length)-(groups[a].p1.length+groups[a].p2.length))||a.localeCompare(b));
  let sel=PC.ui.act.bar;if(!sel||!groups[sel])sel=order[0];
  const am=Math.max(1,...order.map(a=>groups[a].p1.length+groups[a].p2.length));
  let lastP='';const bars=ours.length?'<div class="pc-hb">'+order.map(a=>{const gp=groups[a].p1.length?'1':'2';const dv=gp!==lastP?'<div class="pc-hdv"><i style="background:'+COL[gp]+'"></i>'+(gp==='1'?'P1 · Needs action now':'P2 · Permitting → NTP')+'</div>':'';lastP=gp;return dv+(()=>{const g=groups[a];return'<button class="pc-hr'+(a===sel?' on':'')+'" onclick="pcAct(\'bar\',\''+es(a).replace(/'/g,"\\'")+'\')"><span class="pc-hl">'+es(a)+'</span><span class="pc-ht"><span style="width:'+(g.p1.length/am*100)+'%;background:'+COL['1']+'"></span><span style="width:'+(g.p2.length/am*100)+'%;background:'+COL['2']+'"></span></span><b>'+(g.p1.length+g.p2.length)+'</b></button>';})();}).join('')+'</div>':empty('&#10003; Nothing in our court with these filters.');
  const selG=sel&&groups[sel]?[...groups[sel].p1,...groups[sel].p2]:[];
  h+='<div class="pc-grid2"><section class="pc-chart pc-acts"><h4>What needs doing <span>P1 + P2 by action · click a bar</span></h4>'+bars+'</section>'+
    '<section class="pc-chart pc-sel"><h4>'+(sel?es(sel):'Jobs')+' <span class="pc-count">'+selG.length+'</span></h4>'+(selG.length?jl(selG):empty('Pick an action.'))+'</section></div>';
  // program stacked bars
  const pm=Math.max(1,...progs.map(p=>fl.filter(x=>x.program===p).length));
  const progChart='<div class="pc-chart pc-progc"><h4>By program <span>click to filter</span></h4><div class="pc-pb">'+progs.map(p=>{const it=fl.filter(x=>x.program===p);return'<div class="pc-pr"><span class="pc-pl" onclick="pcCell(\''+p+'\',\'\')">'+pn(p)+'</span><span class="pc-pt">'+['1','2','Watch','none'].map(k=>{const n=it.filter(x=>x.priority===k).length;return n?'<span title="'+PRI_LABEL[k]+': '+n+'" onclick="pcCell(\''+p+'\',\''+k+'\')" style="width:'+(n/pm*100)+'%;background:'+COL[k]+'"></span>':'';}).join('')+'</span><b>'+it.length+'</b></div>';}).join('')+'</div></div>';
  h+='<div class="pc-grid3">'+donut+aging+progChart+'</div>';
  // building permit breakdown (BT jobs not yet started)
  {const isD=v=>v!=null&&/\d/.test(String(v))&&String(v).trim()!=='0';
   const pre=((typeof proj!=='undefined'&&Array.isArray(proj)&&proj.length)?proj:btJobs()).filter(j=>String(j.constructionStage||'').toUpperCase()==='PRESALE');
   const na=[],iss=[],sub=[],ns=[];
   pre.forEach(j=>{if(j.bldgPermitSubmitted==='N/A'||j.bldgPermitIssued==='N/A')na.push(j);else if(isD(j.bldgPermitIssued))iss.push(j);else if(isD(j.bldgPermitSubmitted))sub.push(j);else ns.push(j);});
   const B={iss:['Permit issued','#10b981',iss,'bldgPermitIssued'],sub:['Submitted · pending','#f59e0b',sub,'bldgPermitSubmitted'],ns:['Not submitted','#ef4444',ns,''],na:['Permit not required','#94a3b8',na,'']};
   const tot=iss.length+sub.length+ns.length;const ps=PC.ui.perm||'';
   const tile=k=>{const b=B[k];return'<button class="pc-pmt'+(ps===k?' on':'')+'" style="--c:'+b[1]+'" onclick="PC.ui.perm=PC.ui.perm===\''+k+'\'?\'\':\''+k+'\';renderPrecon()"><b>'+b[2].length+'</b><span>'+b[0]+'</span></button>';};
   const bar='<div class="pc-pmbar">'+['iss','sub','ns'].map(k=>B[k][2].length?'<i role="button" style="flex:'+B[k][2].length+';background:'+B[k][1]+';cursor:pointer" onclick="PC.ui.perm=PC.ui.perm===\''+k+'\'?\'\':\''+k+'\';renderPrecon()" title="'+B[k][0]+': '+B[k][2].length+'"></i>':'').join('')+'</div>';
   let list='';if(ps&&B[ps]){const b=B[ps];const arr=b[2].slice().sort((x,y)=>String(x.address).localeCompare(String(y.address)));
     list='<div class="pc-pml"><h5>'+b[0]+' <span class="pc-count">'+arr.length+'</span></h5>'+(arr.length?'<ul class="pc-list">'+arr.map(j=>'<li><i class="pc-ldot" style="background:'+b[1]+'"></i><span class="pc-la">'+es(j.address||'')+(/^00B/i.test(String(j.jobStatus||'').trim())?' <em class="pc-hold">On Hold</em>':'')+'<small class="pc-sub"> '+es(j.jobStatus||'')+'</small></span>'+(b[3]&&j[b[3]]?'<span class="pc-ld">'+es(String(j[b[3]]).slice(0,10))+'</span>':'')+'<span class="pc-prog">'+es((()=>{const g=String(j.program||'');const c=Object.keys(PCE.GROUPS).find(k=>PCE.GROUPS[k]===g);return c?pn(c):g.replace(/^[A-Z]+ - (FL )?/,'');})())+'</span></li>').join('')+'</ul>':'<div class="pc-none">None.</div>')+'</div>';}
   h+='<section class="pc-chart pc-perm"><h4>Building permits <span>pre-construction jobs (tracker&#39;s Presale list) · tap a count or bar</span></h4>'+
     '<div class="pc-pmhead"><div class="pc-pmtot"><b>'+pre.length+'</b><span>pre-con jobs</span></div><div class="pc-pmsplit"><div class="pc-pmrow"><span>Have permit <b>'+iss.length+'</b></span><span>No permit <b>'+(sub.length+ns.length)+'</b></span></div>'+bar+'</div></div>'+
     '<div class="pc-pmtiles">'+tile('iss')+tile('sub')+tile('ns')+'</div><div class="pc-pmna">'+tile('na')+'<small>excluded from the split</small></div>'+list+'</section>';}
  // calendar
  const EV=[['preConMeetingScheduled','Pre-con meeting','#8b5cf6'],['isvScheduled','ISV scheduled','#06b6d4'],['preConDeadline','Pre-con deadline','#ef4444'],['ntp','NTP','#10b981'],['ntpP','NTP-P','#34d399'],['bldgPermitSubmitted','Permit submitted','#f59e0b'],['permitKickedBack','Permit kicked back','#f97316'],['permitResubmitted','Permit resubmitted','#eab308'],['bldgPermitIssued','Permit issued','#84cc16'],['costEstimateSubmitted','CE submitted','#3b82f6'],['ceReturned','CE returned','#ec4899'],['ceResubmitted','CE resubmitted','#6366f1']];
  const ymd=d=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);return p;};
  const evs={};fl.forEach(x=>{if(!x.bt)return;EV.forEach(([f,l,c])=>{const v=x.bt[f];if(!v||!/\d/.test(String(v)))return;const d=PCE.parseETDate(String(v));if(!d||isNaN(d))return;const k=ymd(d);(evs[k]=evs[k]||[]).push({x,l,c});});});
  PC._evs=evs;const cal=PC.ui.cal=PC.ui.cal||{mode:'month',anchor:ymd(new Date()),day:''};const today=ymd(new Date());
  const [ay,am2,ad]=cal.anchor.split('-').map(Number);let days=[];
  if(cal.mode==='month'){const first=new Date(Date.UTC(ay,am2-1,1,12));const st=new Date(first);st.setUTCDate(1-first.getUTCDay());for(let i=0;i<42;i++){const d=new Date(st);d.setUTCDate(st.getUTCDate()+i);days.push(d);}if(days.slice(35).every(d=>d.getUTCMonth()!==am2-1))days=days.slice(0,35);}
  else{const a=new Date(Date.UTC(ay,am2-1,ad,12));a.setUTCDate(a.getUTCDate()-a.getUTCDay());for(let i=0;i<7;i++){const d=new Date(a);d.setUTCDate(a.getUTCDate()+i);days.push(d);}}
  const k8=d=>d.toISOString().slice(0,10);
  const title=cal.mode==='month'?new Date(Date.UTC(ay,am2-1,1,12)).toLocaleString('en-US',{month:'long',year:'numeric',timeZone:'UTC'}):'Week of '+days[0].toLocaleString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  const used=new Set();days.forEach(d=>(evs[k8(d)]||[]).forEach(e=>used.add(e.l)));
  const cells=days.map(d=>{const k=k8(d);const e=evs[k]||[];const out=cal.mode==='month'&&d.getUTCMonth()!==am2-1;const ty=[...new Map(e.map(v=>[v.l,v.c])).entries()];
    return'<button class="pc-cd'+(out?' out':'')+(k===today?' today':'')+(k===cal.day?' on':'')+(e.length?' has':'')+'" onclick="pcCal(\'day\',\''+k+'\')"><span class="pc-cn">'+d.getUTCDate()+'</span>'+(cal.mode==='week'?e.slice(0,6).map(v=>'<span class="pc-cev" style="--c:'+v.c+'">'+es(v.x.address)+'</span>').join('')+(e.length>6?'<span class="pc-cmore">+'+(e.length-6)+'</span>':''):'<span class="pc-dots">'+ty.slice(0,4).map(([l,c])=>'<i style="background:'+c+'"></i>').join('')+'</span>'+(e.length>1?'<span class="pc-cc">'+e.length+'</span>':''))+'</button>';}).join('');
  const dayEv=cal.day&&evs[cal.day]||[];
  const dayList=cal.day?'<div class="pc-cdl"><h5>'+new Date(cal.day+'T12:00:00Z').toLocaleString('en-US',{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'})+'</h5>'+(dayEv.length?'<ul class="pc-list">'+dayEv.map(v=>'<li onclick="pcDrawer(\''+es(v.x.job_key).replace(/'/g,"\\'")+'\')"><i class="pc-ldot" style="background:'+v.c+'"></i><span class="pc-la">'+es(v.x.address)+'</span><span class="pc-evl">'+es(v.l)+'</span><span class="pc-prog">'+pn(v.x.program)+'</span><span class="pc-lo">&#8250;</span></li>').join('')+'</ul>':'<div class="pc-none">No events.</div>')+'</div>':'';
  h+='<section class="pc-chart pc-cal"><div class="pc-calh"><h4>Calendar</h4><div class="pc-calnav"><button onclick="pcCal(\'prev\')" aria-label="Previous">&#8249;</button><b>'+title+'</b><button onclick="pcCal(\'next\')" aria-label="Next">&#8250;</button><button class="pc-calt" onclick="pcCal(\'today\')">Today</button></div><div class="pc-seg pc-calm"><button class="pc-f'+(cal.mode==='month'?' on':'')+'" onclick="pcCal(\'mode\',\'month\')">Month</button><button class="pc-f'+(cal.mode==='week'?' on':'')+'" onclick="pcCal(\'mode\',\'week\')">Week</button></div></div>'+
    '<div class="pc-cg '+cal.mode+'">'+['S','M','T','W','T','F','S'].map(w=>'<span class="pc-wk">'+w+'</span>').join('')+cells+'</div>'+
    '<div class="pc-cleg">'+EV.filter(e=>used.has(e[1])).map(e=>'<span><i style="background:'+e[2]+'"></i>'+e[1]+'</span>').join('')+(used.size?'':'<span class="pc-sub">No dated events in this '+cal.mode+'.</span>')+'</div>'+dayList+'</section>';
  const fold=(id,title,n,body,sub)=>'<details class="pc-fold" id="'+id+'"><summary><span class="pc-chev">&#8250;</span><h3>'+title+'</h3>'+(n!=null?'<span class="pc-count">'+n+'</span>':'')+'</summary><div class="pc-fb">'+body+'</div></details>';
  h+='<div class="pc-folds">';
  h+=fold('pc-f-w','Watch',watch.length,tbl(watch,1000,'Nothing on the watch list.'),'monitor, no action yet');
  h+=fold('pc-f-n','Not our court',none.length,tbl(none,2000,'Nothing here.'),'waiting on program or others');
  // recent changes
  const wk=now-7*86400000;const scopeKeys=new Set(inScope.map(x=>x.program+'|'+x.record_id));
  let ch=PC.changes.filter(c=>new Date(c.changed_at).getTime()>=wk&&scopeKeys.has(c.program+'|'+c.record_id));
  const qk=new Set(fl.map(x=>x.program+'|'+x.record_id));ch=ch.filter(c=>qk.has(c.program+'|'+c.record_id));
  ch=ch.map(c=>{const nowY=c.field!=='(record)'&&PCE.ourCourt(R,c.program,c.field,c.new_value);const wasY=c.old_value!=='(unknown)'&&PCE.ourCourt(R,c.program,c.field,c.old_value);return{...c,nowY,entered:nowY&&!wasY};});
  if(PC.chg.our)ch=ch.filter(c=>c.nowY);if(PC.chg.entered)ch=ch.filter(c=>c.entered);
  ch.sort((a,b)=>String(b.changed_at).localeCompare(String(a.changed_at)));
  h+=fold('pc-f-c','Recent changes',ch.length,'<div class="pc-frow" style="margin-bottom:10px"><label class="pc-sw"><input type="checkbox" '+(PC.chg.our?'checked':'')+' onchange="pcChg(\'our\',this.checked)"> Now in our court</label><label class="pc-sw"><input type="checkbox" '+(PC.chg.entered?'checked':'')+' onchange="pcChg(\'entered\',this.checked)"> Entered our court</label></div>'+
    (ch.length?'<div class="pc-tw pc-scroll"><table class="pc-q"><thead><tr><th>Changed (ET)</th><th>Program</th><th>ID</th><th>Address</th><th>Applicant</th><th>Field</th><th>Old → New</th><th>Our court</th><th>Source</th></tr></thead><tbody>'+ch.slice(0,300).map(c=>'<tr><td class="pc-nw">'+(c.changed_at_precision==='detected'?'≤ ':'')+fmtET(c.changed_at)+'</td><td><span class="pc-prog">'+pn(c.program)+'</span></td><td class="pc-nw">'+es(c.record_id)+'</td><td>'+es(c.address)+'</td><td>'+es(c.applicant)+'</td><td>'+es(c.field)+'</td><td><span class="pc-sub">'+es(c.old_value)+'</span> → <b>'+es(c.new_value)+'</b></td><td>'+(c.entered?'<span class="pc-chip pc-p1">Entered</span>':c.nowY?'Yes':'')+'</td><td class="pc-sub">'+es(c.source)+'</td></tr>').join('')+'</tbody></table></div>'
      :'<div class="pc-none">No changes in the last 7 days. Changes appear after a second pull of the same program, or from “Updated” dates on the first pull.</div>'),'last 7 days, pre-con scope');
  // gaps
  const g=res.gaps;const um=Object.entries(g.unmapped).map(([k,n])=>{const[p,f,v]=k.split('|');return{p,f,v,n};}).sort((a,b)=>b.n-a.n);
  const gl=(t,arr,fn)=>'<details class="pc-gap"><summary><span>'+t+'</span> <b class="'+(arr.length?'':'z')+'">('+arr.length+')</b></summary><div class="pc-gl">'+(arr.length?arr.slice(0,300).map(fn).join(''):'<div class="pc-sub">None</div>')+'</div></details>';
  const idf=x=>'<div>'+pn(x.program)+' · '+es(x.id)+' · '+es(x.address||'')+'</div>';
  const gTot=g.unknownRfi.length+g.unknownSeptic.length+g.unmatched.length+g.ambiguous.length+g.stageMismatch.length+um.length+g.missingFields.length;
  h+=fold('pc-f-g','Data gaps',gTot,'<div class="pc-gaps">'+
    gl('Unknown RFI',g.unknownRfi,idf)+gl('Unknown septic',g.unknownSeptic,x=>'<div>'+pn(x.program)+' · '+es(x.id)+' · '+es(x.address)+' · <i>'+es(x.septic||'blank')+'</i></div>')+
    gl('Unmatched (no BT job by case # or address)',g.unmatched,x=>'<div>'+pn(x.program)+' · '+es(x.id)+' · '+es(x.address||'')+' · '+es(x.applicant||'')+'</div>')+
    gl('Ambiguous matches',g.ambiguous,idf)+gl('Stage mismatch (program pre-con, BT 20+)',g.stageMismatch,x=>'<div>'+pn(x.program)+' · '+es(x.id)+' · '+es(x.address)+' · '+es(x.program_value)+' vs BT '+es(x.bt_status)+'</div>')+
    gl('Unmapped values',um,x=>'<div>'+x.p+' · '+es(x.f)+' = <b>'+es(x.v)+'</b> ('+x.n+')</div>')+gl('Missing fields',g.missingFields,x=>'<div>'+pn(x.program)+' · '+es(x.field)+'</div>')+'</div>','matching & data quality');
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
