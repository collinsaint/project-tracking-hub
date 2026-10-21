// Pre-Con Priority rules engine (browser + Node). Port of reference_engine.py
// from the dashboard build spec, extended with the spec's matching, gaps and
// change-diff logic. No DOM, no network.
(function(root){
const PROGRAMS=['LC','OC','PIN','RFL','SRQ','PAS','GA'];
const PROGRAM_NAMES={LC:'Lee Cares',OC:'Orange County',PIN:'Pinellas Recovers',RFL:'RebuildFL',SRQ:'ResilientSRQ',PAS:'Pasco Better Future',GA:'Georgia HRRP',BT:'BT-only'};
const GROUPS={LC:'HORNE - FL Lee Cares',OC:'HORNE - FL Orange County',PIN:'HORNE - FL Pinellas',RFL:'BDO - Rebuild FL',SRQ:'DSW - FL Resilient SRQ',PAS:'IEM - Pasco Better Future',GA:'LEMOINE - Georgia HRRP'};
const SCOPE={LC:'Status',OC:'Status',PIN:'Construction Status',RFL:'Status',SRQ:'Status',PAS:'Construction Stage',GA:'Status'};
const PRECON_STAGES=['Assignment','Site Visit','Cost Estimate','Work Order','RFI','Permitting','Septic','Pre-Con Meeting','NTP','Pending Start','Pre-Con (phase)'];
const STAGE_ORDER=PRECON_STAGES.concat(['Program','Hold/Withdrawn','Construction','Inspection','Key Turnover','Change Order','Invoice','Closeout']);
const LEAD=['ID','Applicant','Address','City','Status','Status Updated'];
// Signature columns used to auto-detect the program of an uploaded file.
const SIGNATURE={GA:['PreCon - PCC Substatus'],PAS:['SWE RFI Status','Construction Stage'],RFL:['Preconstruction Status','THAB Status'],
  PIN:['Construction Status Updated'],OC:['Const - Inspection Status','CE - Most Advanced Status Export'],LC:['Sewer System','CE - Most Advanced Status Export'],SRQ:['Case']};
const ID_PATTERN={LC:/^LC-/i,OC:/^OC-/i,PIN:/^PC-/i,RFL:/^FL-\d{4}-/i,SRQ:/^\d+\s+-\s+\d+$/,GA:/^\d{6,8}$/,PAS:/^\d{4,6}$/};
// Phase 4 rules use BT custom fields; reference_engine.py only used these BT inputs.
const PHASE1_BT_FIELDS=['Job Status','Permit Status'];
const PHASE1_DERIVED=['BLDG_PERMIT_SUBMITTED_NOT_ISSUED','BLDG_PERMIT_ISSUED_NO_NTP'];
const BT_FIELD={'Job Status':'jobStatus','Permit Status':'permitStatus','Building Permit':'bldgPermitStatus','Septic':'septic','Sewer Type':'sewerType','Canopy Status':'canopyStatus'};

const norm=v=>String(v==null?'':v).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
const has=v=>v!==undefined&&v!==null&&String(v).trim()!=='';
const btHas=v=>has(v)&&String(v).trim().toUpperCase()!=='N/A';
const lastDigits=s=>{const m=String(s==null?'':s).match(/\d+/g);return m?m[m.length-1]:null;};
const _SFX={drive:'dr',lane:'ln',road:'rd',street:'st',avenue:'ave',boulevard:'blvd',court:'ct',place:'pl',circle:'cir',terrace:'ter',trail:'trl',way:'wy'};
function addrKey(s){let v=String(s||'').toLowerCase().replace(/\s+/g,' ').split(',')[0];v=v.replace(/[^a-z0-9 ]/g,' ').trim().replace(/\s+/g,' ');
  Object.keys(_SFX).forEach(l=>{v=v.replace(new RegExp('\\b'+l+'$'),'_'+_SFX[l]);});return v.replace(/[^a-z0-9]/g,'');}
function recordKey(p,id){return p==='SRQ'?String(id).split('-')[0].trim():lastDigits(id);}
function isStatusField(c){return /status|stage|substatus/i.test(c)&&!/updated|date|status exports/i.test(c);}
function updatedPairs(cols){const set=new Set(cols),out={};cols.forEach(c=>{if(/ Updated$/.test(c)){let b=c.replace(/ Updated$/,'');if(b==='TLR Status')b='Team Lead Review Status';if(set.has(b))out[b]=c;}});return out;}

function prepRules(rules){
  const all=rules.map(r=>({...r,_v:norm(r.Value),_m:(r.MatchType||'exact').toLowerCase()==='prefix'?'prefix':'exact'}));
  const idx={};all.forEach(r=>{const k=r.Program+'|'+r.Field;(idx[k]=idx[k]||[]).push(r);});
  return{all,idx,active:all.filter(r=>(r.Active||'Y')==='Y')};
}
function matchRules(rows,val){const v=norm(val);if(!v||!rows)return[];return rows.filter(r=>r._m==='exact'?v===r._v:v.startsWith(r._v));}
function detectProgram(fileName,cols,rows){
  const fm=String(fileName||'').match(/^(LC|OC|PIN|RFL|SRQ|PAS|GA)_/i);if(fm)return{program:fm[1].toUpperCase(),how:'file name'};
  const cs=new Set(cols);
  for(const p of ['GA','PAS','RFL','PIN','OC','LC','SRQ']){if(SIGNATURE[p].every(c=>cs.has(c)))return{program:p,how:'columns'};}
  const ids=rows.slice(0,20).map(r=>String(r.ID||'').trim()).filter(Boolean);
  for(const p of ['LC','OC','PIN','RFL','SRQ']){if(ids.length&&ids.filter(i=>ID_PATTERN[p].test(i)).length>=ids.length*0.8)return{program:p,how:'ID pattern'};}
  return{program:'',how:''};
}
function pullTimeFromName(name){const m=String(name||'').match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/);return m?{y:+m[1],mo:+m[2],d:+m[3],h:+m[4],mi:+m[5]}:null;}
function etToUtc(y,mo,d,h,mi,s){const guess=Date.UTC(y,mo-1,d,h,mi,s||0);
  const off=t=>{const f=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(t));const g=k=>+f.find(x=>x.type===k).value;return Date.UTC(g('year'),g('month')-1,g('day'),g('hour'),g('minute'),g('second'))-t;};
  let t=guess-off(guess);t=guess-off(t);return new Date(t);}
// "5/26/2026 10:25:03 AM" / "2026-05-26" / Excel-formatted → Date (assumed ET)
function parseETDate(v){if(!has(v))return null;const s=String(v).trim();let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?/i);
  if(m){let y=+m[3];if(y<100)y+=2000;let h=+(m[4]||0);if(m[7]){h=h%12+(m[7].toUpperCase()==='PM'?12:0);}return etToUtc(y,+m[1],+m[2],h,+(m[5]||0),+(m[6]||0));}
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);if(m)return etToUtc(+m[1],+m[2],+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0));
  const t=Date.parse(s);return isNaN(t)?null:new Date(t);}
function jsCode(js){const m=String(js||'').match(/^(\d+(?:\.\d+)?)([A-Z])?/i);return m?{n:parseFloat(m[1]),s:(m[2]||'').toUpperCase()}:null;}

// BT index from hub projects (proj). Keyed by group + last digits of Prefix.
function buildBt(projects){
  const byKey={},byAddr={},count={};
  projects.forEach(j=>{const g=String(j.program||'').trim();const k=lastDigits(j.projectNumber);
    if(k){const kk=g+'|'+k;count[kk]=(count[kk]||0)+1;if(!byKey[kk])byKey[kk]=j;}
    [j.address,j.jobName,j.streetAddress].forEach(a=>{if(a){const ak=g+'|'+addrKey(a);(byAddr[ak]=byAddr[ak]||new Set()).add(j);}});});
  return{byKey,byAddr,count};
}
function matchRecord(p,rec,bt){const g=GROUPS[p];const k=recordKey(p,rec.ID);
  if(k&&bt.byKey[g+'|'+k])return{job:bt.byKey[g+'|'+k],method:bt.count[g+'|'+k]>1?'ambiguous':'id'};
  const s=bt.byAddr[g+'|'+addrKey(rec.Address)];if(s&&s.size===1)return{job:[...s][0],method:'address'};
  if(s&&s.size>1)return{job:null,method:'ambiguous'};return{job:null,method:'none'};}

function derived(key,j){
  const g=f=>j[f];
  switch(key){
    case 'BLDG_PERMIT_SUBMITTED_NOT_ISSUED':return btHas(g('bldgPermitSubmitted'))&&!btHas(g('bldgPermitIssued'));
    case 'BLDG_PERMIT_ISSUED_NO_NTP':return btHas(g('bldgPermitIssued'))&&!btHas(g('ntp'));
    case 'RFI_NEEDED_NOT_REQUESTED':return /^(yes|true|checked|y)$/i.test(g('rfiNeeded')||'')&&!btHas(g('rfiRequested'));
    case 'ADDL_RFI_NEEDED_NOT_REQUESTED':return /^(yes|true|checked|y)$/i.test(g('addlRfiNeeded')||'')&&!btHas(g('addlRfiRequested'));
    case 'RFI_AWAITING_DOCS':return(btHas(g('rfiRequested'))&&!btHas(g('rfiReceived')))||(btHas(g('addlRfiRequested'))&&!btHas(g('addlRfiReceived')));
    case 'SITE_VISIT_NOT_SCHEDULED':return btHas(g('assignmentReceived'))&&!/^yes$/i.test(g('isvScheduled')||'')&&!btHas(g('isvCompleted'));
    case 'SITE_VISIT_SCHEDULED_NOT_DONE':return /^yes$/i.test(g('isvScheduled')||'')&&!btHas(g('isvCompleted'));
    case 'CE_RETURNED_NOT_RESUBMITTED':return btHas(g('ceReturned'))&&(!btHas(g('ceResubmitted'))||String(g('ceResubmitted'))<String(g('ceReturned')));
    case 'PERMIT_KICKED_BACK_NOT_RESUBMITTED':return btHas(g('permitKickedBack'))&&(!btHas(g('permitResubmitted'))||String(g('permitResubmitted'))<String(g('permitKickedBack')));
    case 'SEPTIC_NEEDED_NO_PERMIT':{const s=norm(g('septic'));const need=s==='yes'||s==='yes - septic permit curation'||/septic/i.test(g('sewerType')||'')||/^septic$/i.test(j._lcSewer||'');return need&&s!=='yes - keep existing'&&!btHas(g('septicPermitIssued'));}
    case 'PRECON_SCHEDULED_NOT_COMPLETED':return btHas(g('preConMeetingScheduled'))&&!btHas(g('preConMeetingCompleted'));
  }return false;}
const DERIVED_DATE={BLDG_PERMIT_SUBMITTED_NOT_ISSUED:'bldgPermitSubmitted',BLDG_PERMIT_ISSUED_NO_NTP:'bldgPermitIssued',RFI_AWAITING_DOCS:'rfiRequested',CE_RETURNED_NOT_RESUBMITTED:'ceReturned',PERMIT_KICKED_BACK_NOT_RESUBMITTED:'permitKickedBack',PRECON_SCHEDULED_NOT_COMPLETED:'preConMeetingScheduled',SITE_VISIT_NOT_SCHEDULED:'assignmentReceived'};

function btHits(R,j,phase4){const hits=[];
  Object.keys(BT_FIELD).forEach(fld=>{if(!phase4&&!PHASE1_BT_FIELDS.includes(fld))return;
    matchRules(R.active.filter(r=>r.Program==='ALL'&&r.Field===fld),j[BT_FIELD[fld]]).forEach(r=>{if(r.OurCourt==='Y'||r.Priority==='Watch')hits.push({rule:r,field:fld,value:String(j[BT_FIELD[fld]]),src:'BT'});});});
  R.active.filter(r=>r.Program==='ALL'&&r.Field==='DERIVED').forEach(r=>{if(!phase4&&!PHASE1_DERIVED.includes(r.Value))return;if(derived(r.Value,j))hits.push({rule:r,field:'DERIVED',value:r.Value,src:'BT'});});
  return hits;}
function rankHits(hits){
  const merged=[];hits.forEach(h=>{const m=merged.find(x=>x.rule.Action===h.rule.Action&&x.rule.Priority===h.rule.Priority);if(m){m.fields.push(h.field+': '+h.value);}else merged.push({...h,fields:[h.field+': '+h.value]});});
  const pv=p=>p==='1'?1:p==='2'?2:p==='3'?3:p==='Watch'?8:9;
  merged.sort((a,b)=>pv(a.rule.Priority)-pv(b.rule.Priority)||STAGE_ORDER.indexOf(a.rule.Stage)-STAGE_ORDER.indexOf(b.rule.Stage)||String(a.rule.RuleID).localeCompare(String(b.rule.RuleID)));
  const ours=hits.map(h=>h.rule.Priority).filter(p=>p==='1'||p==='2').sort();
  const priority=ours.length?ours[0]:(hits.length?'Watch':'none');
  return{priority,hits:merged};}

// pulls: {PROG:{meta,records}}, projects: hub proj, rules: array, opts:{phase4,showHold,changes}
function evaluate(pulls,projects,rules,opts){
  opts=opts||{};const R=prepRules(rules);const bt=buildBt(projects);const now=opts.now||new Date();
  const queue=[],gaps={unmatched:[],ambiguous:[],stageMismatch:[],unmapped:{},missingFields:[],unknownRfi:[],unknownSeptic:[]};
  const matchedJobs=new Set();const stats={};
  PROGRAMS.forEach(p=>{const pull=pulls[p];if(!pull)return;const recs=pull.records;const cols=pull.meta.columns||Object.keys(recs[0]||{});const colset=new Set(cols);
    const st=stats[p]={records:recs.length,id:0,address:0,none:0,ambiguous:0,inScope:0};
    const rp=R.active.filter(r=>r.Program===p);const flds=[...new Set(rp.map(r=>r.Field))];
    flds.forEach(f=>{if(!colset.has(f))gaps.missingFields.push({program:p,field:f});});
    const allFlds=[...new Set(R.all.filter(r=>r.Program===p).map(r=>r.Field)).add(SCOPE[p])];
    const upd=updatedPairs(cols);
    recs.forEach(rec=>{
      const m=matchRecord(p,rec,bt);if(m.job&&opts.excludeJob&&opts.excludeJob(m.job)){st.withdrawn=(st.withdrawn||0)+1;return;}st[m.method]++;if(m.job)matchedJobs.add(m.job);
      if(m.method==='none')gaps.unmatched.push({program:p,id:rec.ID,address:rec.Address,applicant:rec.Applicant});
      if(m.method==='ambiguous')gaps.ambiguous.push({program:p,id:rec.ID,address:rec.Address});
      allFlds.forEach(f=>{if(colset.has(f)&&has(rec[f])&&!matchRules(R.idx[p+'|'+f],rec[f]).length){const k=p+'|'+f+'|'+String(rec[f]).trim();gaps.unmapped[k]=(gaps.unmapped[k]||0)+1;}});
      const sc=matchRules(R.idx[p+'|'+SCOPE[p]],rec[SCOPE[p]]);
      if(!sc.length||!PRECON_STAGES.includes(sc[0].Stage))return;
      st.inScope++;
      let hits=[];
      flds.forEach(f=>{if(colset.has(f)&&has(rec[f]))matchRules(R.idx[p+'|'+f].filter(r=>(r.Active||'Y')==='Y'&&(!r.WhenStatus||norm(rec.Status).includes(norm(r.WhenStatus)))),rec[f]).forEach(r=>{if(r.OurCourt==='Y'||r.Priority==='Watch')hits.push({rule:r,field:f,value:String(rec[f]),src:'program'});});});
      const j=m.method==='id'?m.job:(m.method==='address'&&opts.addressHits?m.job:null);
      if(j){if(p==='LC')j._lcSewer=rec['Sewer System'];
        // The program export is the source of truth for how far along a record is: drop BT Job Status
        // site-visit/assignment hits when the program itself reports a later stage (e.g. a stale BT '02 - Pending Site Visit
        // Scheduling' when the program already says Pre-construction Conference).
        const si=Math.max(-1,...[sc[0].Stage,...hits.map(h=>h.rule.Stage)].filter(st=>st!=='Pre-Con (phase)').map(st=>PRECON_STAGES.indexOf(st)));hits=hits.concat(btHits(R,j,opts.phase4).filter(h=>!(h.field==='Job Status'&&(h.rule.Stage==='Assignment'||h.rule.Stage==='Site Visit')&&si>PRECON_STAGES.indexOf(h.rule.Stage))));}
      const rk=rankHits(hits);const top=rk.hits[0];
      if(m.job){const c=jsCode(m.job.jobStatus);if(c&&c.n>=20)gaps.stageMismatch.push({program:p,id:rec.ID,address:rec.Address,program_value:rec[SCOPE[p]],bt_status:m.job.jobStatus});}
      if(p!=='PAS'){const jj=m.job;if(!jj||!(btHas(jj.rfiRequested)||btHas(jj.addlRfiRequested)||/^(yes|true)$/i.test(jj.rfiNeeded||'')))gaps.unknownRfi.push({program:p,id:rec.ID,address:rec.Address});}
      {const jj=m.job;const s=jj?norm(jj.septic):'';if(!jj||!s||s==='pending evaluation'||(s==='yes - septic permit issued'&&!btHas(jj.septicPermitIssued))||(p==='LC'&&!has(rec['Sewer System'])))gaps.unknownSeptic.push({program:p,id:rec.ID,address:rec.Address,septic:jj?jj.septic||'':'(no BT match)'});}
      // days in status
      let days=null,basis='';
      if(top){if(top.src==='program'){const uf=upd[top.field]||(top.field==='SWE RFI Status'&&colset.has('Latest RFI Status Date')?'Latest RFI Status Date':'');const d=uf?parseETDate(rec[uf]):null;if(d){days=Math.floor((now-d)/86400000);basis=uf;}}
        else if(top.field==='DERIVED'&&DERIVED_DATE[top.value]&&j){const d=parseETDate(j[DERIVED_DATE[top.value]]);if(d){days=Math.floor((now-d)/86400000);basis=DERIVED_DATE[top.value];}}}
      if(days===null&&top&&opts.changes){const cs=opts.changes.filter(c=>c.program===p&&c.record_id===String(rec.ID)&&c.field===top.field&&norm(c.new_value)===norm(top.value));if(cs.length){const d=new Date(cs.map(c=>c.changed_at).sort()[0]);days=Math.floor((now-d)/86400000);basis='first seen in change log';}}
      queue.push({job_key:p+':'+rec.ID,program:p,record_id:String(rec.ID),address:rec.Address||'',applicant:rec.Applicant||'',bt:m.job,match:m.method,
        scope_value:rec[SCOPE[p]],scope_stage:sc[0].Stage,priority:rk.priority,hits:rk.hits,primary:top||null,stage:top?top.rule.Stage:sc[0].Stage,
        days,days_basis:basis,days_ge:basis==='first seen in change log',superintendent:m.job?m.job.superintendent||'':'',cm:m.job?m.job.cm||'':'',program_cm:rec['Construction Manager']||''});
    });
  });
  // BT-only jobs: not matched to any program record, Job Status 01–19.x (00B only with showHold)
  projects.forEach(j=>{if(matchedJobs.has(j))return;const c=jsCode(j.jobStatus);if(!c)return;
    if(opts.excludeJob&&opts.excludeJob(j))return;const hold=/^00B/i.test(String(j.jobStatus));if(hold&&!opts.showHold)return;if(!hold&&(c.n<1||c.n>=20))return;
    const rk=rankHits(btHits(R,j,opts.phase4));const top=rk.hits[0];let days=null,basis='';
    if(top&&top.field==='DERIVED'&&DERIVED_DATE[top.value]){const d=parseETDate(j[DERIVED_DATE[top.value]]);if(d){days=Math.floor((now-d)/86400000);basis=DERIVED_DATE[top.value];}}
    queue.push({job_key:'BT:'+addrKey(j.address),program:'BT',bt_group:j.program||'',record_id:j.projectNumber||'',address:j.address,applicant:[j.firstName,j.lastName].filter(Boolean).join(' '),bt:j,match:'bt-only',
      scope_value:j.jobStatus,scope_stage:'',priority:rk.priority,hits:rk.hits,primary:top||null,stage:top?top.rule.Stage:'',days,days_basis:basis,superintendent:j.superintendent||'',cm:j.cm||'',hold});});
  const pv=p=>p==='1'?1:p==='2'?2:p==='Watch'?3:4;
  queue.sort((a,b)=>pv(a.priority)-pv(b.priority)||((b.days==null?-1:b.days)-(a.days==null?-1:a.days))||a.program.localeCompare(b.program)||a.address.localeCompare(b.address));
  return{queue,gaps,stats};
}

// Diff a new pull against the previous one (same program). Returns change rows.
function diffPulls(p,prev,cur,detail){
  const out=[];const pullAt=cur.meta.pull_at;
  if(!prev){ // first pull: backfill from "Updated" columns (30 days)
    const pairs=updatedPairs(cur.meta.columns);const cutoff=new Date(pullAt).getTime()-30*86400000;
    cur.records.forEach(r=>Object.entries(pairs).forEach(([f,u])=>{if(!isStatusField(f)||!has(r[f]))return;const d=parseETDate(r[u]);if(!d||d.getTime()<cutoff)return;
      out.push({program:p,record_id:String(r.ID),address:r.Address||'',applicant:r.Applicant||'',field:f,old_value:'(unknown)',new_value:String(r[f]).trim(),changed_at:d.toISOString(),changed_at_precision:'exact',source:'updated date',detail:u});}));
    return out;}
  const pc=new Set(prev.meta.columns),cols=cur.meta.columns.filter(c=>pc.has(c)&&isStatusField(c));
  const pairs=updatedPairs(cur.meta.columns);
  const pm={};prev.records.forEach(r=>{pm[String(r.ID)]=r;});const seen=new Set();
  cur.records.forEach(r=>{const id=String(r.ID);seen.add(id);const o=pm[id];
    if(!o){out.push({program:p,record_id:id,address:r.Address||'',applicant:r.Applicant||'',field:'(record)',old_value:'(none)',new_value:'added',changed_at:pullAt,changed_at_precision:'detected',source:'record event',detail});return;}
    cols.forEach(f=>{const a=norm(o[f]),b=norm(r[f]);if(a===b)return;
      let at=pullAt,prec='detected';const u=pairs[f];if(u&&norm(o[u])!==norm(r[u])){const d=parseETDate(r[u]);if(d){at=d.toISOString();prec='exact';}}
      out.push({program:p,record_id:id,address:r.Address||'',applicant:r.Applicant||'',field:f,old_value:String(o[f]==null?'':o[f]).trim(),new_value:String(r[f]==null?'':r[f]).trim(),changed_at:at,changed_at_precision:prec,source:'pull diff',detail});});});
  prev.records.forEach(o=>{const id=String(o.ID);if(!seen.has(id))out.push({program:p,record_id:id,address:o.Address||'',applicant:o.Applicant||'',field:'(record)',old_value:'present',new_value:'removed',changed_at:pullAt,changed_at_precision:'detected',source:'record event',detail});});
  return out;}
function ourCourt(R,p,field,val){return matchRules(R.idx[p+'|'+field],val).some(r=>r.OurCourt==='Y'&&(r.Active||'Y')==='Y');}
// Keep only columns the dashboard needs (lead, status/stage/date/updated, rule fields).
function trimRecord(rec,keep){const o={};keep.forEach(c=>{if(has(rec[c]))o[c]=rec[c];});return o;}
function keepColumns(p,cols,rules){const rf=new Set(rules.filter(r=>r.Program===p).map(r=>r.Field));
  return cols.filter(c=>LEAD.includes(c)||rf.has(c)||/status|stage|updated|date/i.test(c)||c==='Sewer System'||c==='Construction Manager');}

root.PCE={PROGRAMS,PROGRAM_NAMES,GROUPS,SCOPE,PRECON_STAGES,STAGE_ORDER,LEAD,norm,has,addrKey,recordKey,prepRules,matchRules,detectProgram,pullTimeFromName,etToUtc,parseETDate,buildBt,matchRecord,evaluate,diffPulls,ourCourt,trimRecord,keepColumns,isStatusField,jsCode};
})(typeof window!=='undefined'?window:globalThis);
