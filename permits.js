// ===== Permit dashboard (replaces the old Permitting queue; Permitting Updates sheet is separate) =====
let permDash={owner:'',stage:'open',search:'',program:'',jur:'',sort:'',dir:1};
const PD_STAGES=[
  ['open','Open permits','Not yet issued','pc-cw'],
  ['none','Not submitted','Waiting on submittal','pc-c2'],
  ['review','In review','Submitted / resubmitted','pc-cw'],
  ['kicked','Kicked back','Awaiting resubmittal','pc-c1'],
  ['issued','Issued','Building permit issued','pc-cn']
];
function _pdHas(v){return !!v&&v!=='0';}
function pdStage(p){
  const s=p.bldgPermitSubmitted||'',i=p.bldgPermitIssued||'';
  if(i==='N/A'||s==='N/A'||_pdHas(i))return'issued';
  if(/^issued$/i.test(String(p.bldgPermitStatus||'').trim())||/^issued$/i.test(String(p.permitStatus||'').trim()))return'issued';
  const kb=p.permitKickedBack||'',rs=p.permitResubmitted||'';
  if(_pdHas(kb)&&!(_pdHas(rs)&&rs>=kb))return'kicked';
  if(_pdHas(s)||_pdHas(rs))return'review';
  return'none';
}
function pdOwner(p){return String(p.permitAssigned||'').trim();}
function pdNeedsPermit(p){
  const lc=v=>String(v||'').trim().toLowerCase();
  if(lc(p.bldgPermitStatus)==='not needed'||lc(p.permitStatus)==='not required')return false;
  if(lc(p.bldgPermitSubmitted)==='n/a'||lc(p.bldgPermitIssued)==='n/a')return false;
  return true;
}
function pdBase(){
  return proj.filter(p=>{
    if(!pdNeedsPermit(p))return false;
    if((p.jobStatus||'').toUpperCase()==='COMPLETE')return false;
    if(p.constructionStage==='PRESALE')return true;
    return pdStage(p)!=='issued'&&p.constructionStage!=='CLOSED'&&p.constructionStage!=='WARRANTY';
  });
}
function permDashFromHash(h){
  const q=(h.split('?')[1]||'');const sp=new URLSearchParams(q);
  permDash.owner=sp.get('owner')||'';permDash.stage=sp.get('stage')||'open';permDash.search=sp.get('q')||'';
  permDash.program=sp.get('program')||'';permDash.jur=sp.get('jur')||'';
}
function _pdWriteHash(){
  if(!permView)return;const sp=new URLSearchParams();
  if(permDash.owner)sp.set('owner',permDash.owner);if(permDash.stage!=='open')sp.set('stage',permDash.stage);
  if(permDash.search)sp.set('q',permDash.search);if(permDash.program)sp.set('program',permDash.program);if(permDash.jur)sp.set('jur',permDash.jur);
  const s=sp.toString();history.replaceState(null,'','#perm'+(s?'?'+s:''));
}
function pdSet(k,v){permDash[k]=v;renderPerm();}
function pdClear(){permDash={...permDash,owner:'',stage:'open',search:'',program:'',jur:''};const s=document.getElementById('pd-search');if(s)s.value='';renderPerm();}
function pdSort(k){if(permDash.sort===k)permDash.dir*=-1;else{permDash.sort=k;permDash.dir=1;}renderPerm();}
function _pdD(v){return _pdHas(v)?(v==='N/A'?'N/A':fd2(v)):'';}
function _pdPair(o,r){
  const O=_pdD(o),R=_pdD(r);
  if(!O&&!R)return'<span class="pd-mut">—</span>';
  return'<div class="pd-pair"><span><i>Ord</i>'+(O||'<span class="pd-mut">—</span>')+'</span><span><i>Rec</i>'+(R?'<b class="pd-ok">'+R+'</b>':'<span class="pd-wait">waiting</span>')+'</span></div>';
}
function _pdStageChip(st){const m={none:['Not submitted','pc-p2'],review:['In review','pc-pw'],kicked:['Kicked back','pc-p1'],issued:['Issued','pd-pi']};const x=m[st];return'<span class="pc-chip '+x[1]+'">'+x[0]+'</span>';}
function _pdDays(p){const src=p.permitResubmitted&&_pdHas(p.permitResubmitted)?p.permitResubmitted:p.bldgPermitSubmitted;if(!_pdHas(src)||src==='N/A')return null;const d=Math.floor((Date.now()-new Date(src))/86400000);return d>=0?d:null;}
function _pdNA(){return'<span class="pd-na">N/A</span>';}
function _pdProgNoPlans(p){return /rebuild\s*f(l|lorida)|pinellas/i.test(p.program||'');}
function _pdRehab(p){return /rehab/i.test(p.jobType||'');}
function _pdRecon(p){return /recon|mhu|replace/i.test(p.jobType||'');}
function _pdRfi(p){
  const one=(n,rq,rc,lbl)=>{if(_pdHas(rc))return'<div><span class="pc-chip pd-pi">'+lbl+' received</span> <span class="pc-sub">'+_pdD(rc)+'</span></div>';if(_pdHas(rq))return'<div><span class="pc-chip pc-p2">'+lbl+' requested</span> <span class="pc-sub">'+_pdD(rq)+'</span></div>';if(/^y/i.test(n||''))return'<div><span class="pc-chip pc-p1">'+lbl+' needed</span></div>';return'';};
  const h=one(p.rfiNeeded,p.rfiRequested,p.rfiReceived,'RFI')+one(p.addlRfiNeeded,p.addlRfiRequested,p.addlRfiReceived,'Add\'l RFI');
  return h||'<span class="pd-mut">None</span>';
}
function renderPerm(){
  const root=document.getElementById('pd-root');if(!root)return;
  const base=pdBase();
  const fs=permDash.search.toLowerCase();
  const pre=base.filter(p=>{
    if(permDash.program&&p.program!==permDash.program)return false;
    if(permDash.jur&&p.permittingJurisdiction!==permDash.jur)return false;
    if(fs){const hay=[pname(p),p.firstName,p.lastName,p.projectNumber,p.bldgPermitNumber].join(' ').toLowerCase();if(!hay.includes(fs))return false;}
    return true;
  });
  const byOwner=pre.filter(p=>!permDash.owner||(permDash.owner==='__none'?!pdOwner(p):pdOwner(p)===permDash.owner));
  const cnt={open:0,none:0,review:0,kicked:0,issued:0};
  byOwner.forEach(p=>{const s=pdStage(p);cnt[s]++;if(s!=='issued')cnt.open++;});
  let rows=byOwner.filter(p=>{const s=pdStage(p);return permDash.stage==='all'||(permDash.stage==='open'?s!=='issued':s===permDash.stage);});
  // owner chips (counts within current stage + other filters)
  const stageOk=p=>{const s=pdStage(p);return permDash.stage==='all'||(permDash.stage==='open'?s!=='issued':s===permDash.stage);};
  const oc={};let un=0;pre.filter(stageOk).forEach(p=>{const o=pdOwner(p);if(o)oc[o]=(oc[o]||0)+1;else un++;});
  const owners=[...new Set(base.map(pdOwner).filter(Boolean))].sort();
  const totStage=pre.filter(stageOk).length;
  const chip=(v,l,n)=>'<button class="pc-f'+(permDash.owner===v?' on':'')+'" onclick="pdSet(\'owner\','+es(JSON.stringify(v)).replace(/&quot;/g,'&quot;')+')">'+es(l)+' <span class="pd-n">'+n+'</span></button>';
  const opts=(vals,cur)=>'<option value="">All</option>'+[...new Set(vals.filter(Boolean))].sort().map(v=>'<option'+(v===cur?' selected':'')+' value="'+es(v)+'">'+es(v)+'</option>').join('');
  // sort
  const sk=permDash.sort,sd=permDash.dir;
  const sv=p=>sk==='job'?pname(p):sk==='owner'?(pdOwner(p)||'\uffff'):sk==='days'?(_pdDays(p)??-1):sk?(p[sk]||''):null;
  const ord={kicked:0,none:1,review:2,issued:3};
  rows=[...rows].sort((a,b)=>{
    if(!sk){const c=ord[pdStage(a)]-ord[pdStage(b)];if(c)return c;return (_pdDays(b)??-1)-(_pdDays(a)??-1);}
    const av=sv(a),bv=sv(b);if(typeof av==='number')return sd*(av-bv);
    if(av===''&&bv!=='')return 1;if(bv===''&&av!=='')return -1;return sd*String(av).localeCompare(String(bv));
  });
  const th=(k,l)=>'<th class="'+(k?'pd-s':'')+(sk===k&&k?(sd===1?' sa':' sd'):'')+'"'+(k?' onclick="pdSort(\''+k+'\')"':'')+'>'+l+'</th>';
  const anyF=permDash.owner||permDash.search||permDash.program||permDash.jur||permDash.stage!=='open';
  const ownerLbl=permDash.owner==='__none'?'Unassigned':permDash.owner;
  let h='<div class="pc-top"><div class="pc-top-t"><h2>Permitting</h2><p>Permit status, owners and paperwork for every active job'+(ownerLbl?' · <b>'+es(ownerLbl)+'</b>':'')+'</p></div>'+
    '<div class="pc-top-act"><button class="btn pc-ol" onclick="openPermUpdView()">Permitting Updates sheet</button></div></div>';
  h+='<div class="pc-cards pd-cards">'+PD_STAGES.map(([k,l,s,c])=>'<button class="pc-card '+c+(permDash.stage===k?' on':'')+'" onclick="pdSet(\'stage\',\''+k+'\')"><span class="pc-cl">'+l+'</span><b>'+cnt[k]+'</b><span class="pc-cs">'+s+'</span></button>').join('')+'</div>';
  h+='<div class="pc-filters"><div class="pc-frow"><span class="pc-fl">Owner</span><div class="pc-seg">'+chip('','All',totStage)+owners.map(o=>chip(o,o,oc[o]||0)).join('')+chip('__none','Unassigned',un)+'</div></div>'+
    '<div class="pc-frow" style="margin-top:8px"><div class="pc-search"><span>&#9906;</span><input id="pd-search" placeholder="Search job, homeowner, prefix, permit #" value="'+es(permDash.search)+'" oninput="permDash.search=this.value;clearTimeout(window._pdT);window._pdT=setTimeout(renderPerm,200)"></div>'+
    '<select onchange="pdSet(\'program\',this.value)" title="Program">'+opts(base.map(p=>p.program),permDash.program).replace('>All<','>All programs<')+'</select>'+
    '<select onchange="pdSet(\'jur\',this.value)" title="Jurisdiction">'+opts(base.map(p=>p.permittingJurisdiction),permDash.jur).replace('>All<','>All jurisdictions<')+'</select>'+
    '<button class="pc-f'+(permDash.stage==='all'?' on':'')+'" style="border:1px solid var(--pc-line);background:'+(permDash.stage==='all'?'':'#fff')+'" onclick="pdSet(\'stage\',\'all\')">Include issued</button>'+
    (anyF?'<button class="pc-clear" onclick="pdClear()">Clear</button>':'')+'</div></div>';
  h+='<section class="pc-panel"><header><h3>Permit queue</h3><span class="pc-count">'+rows.length+'</span><span class="pc-hsub">Click a job to open it. Dates come from the Buildertrend import.</span></header>';
  if(!rows.length)h+='<div class="pc-none">No jobs match these filters.</div>';
  else{
    h+='<div class="pc-tw pd-tw"><table class="pc-q pd-q"><thead><tr>'+th('job','Job')+th('owner','Permit owner')+th('','Status')+th('permittingJurisdiction','Jurisdiction')+th('bldgPermitSubmitted','Submitted')+th('bldgPermitIssued','Issued')+th('days','Days')+th('permitKickedBack','Kickback / Resub')+th('','RFI')+th('surveyOrdered','Survey/EC')+th('plansOrdered','Plans')+th('trussOrdered','Truss plans')+th('energyCalcsOrdered','Energy calcs')+th('','This week')+'</tr></thead><tbody>';
    rows.forEach(p=>{
      const idx=proj.indexOf(p),st=pdStage(p),o=pdOwner(p),d=_pdDays(p),pu=(typeof puData!=='undefined'&&puData[p.address])||{};
      const hm=((p.firstName||'')+' '+(p.lastName||'')).trim();
      const stat=[p.bldgPermitStatus,p.permitStatus].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
      h+='<tr onclick="od('+idx+')" style="cursor:pointer">'+
        '<td><div class="pc-job">'+es(pname(p)||'No address')+'</div><div class="pc-sub">'+es([p.projectNumber,p.city,hm].filter(Boolean).join(' · '))+'</div><div style="margin-top:4px">'+(p.program?'<span class="pc-prog">'+es(p.program)+'</span>':'')+'</div></td>'+
        '<td class="pc-nw">'+(o?'<span class="pd-own">'+es(o)+'</span>':'<span class="pd-mut">Unassigned</span>')+'</td>'+
        '<td>'+_pdStageChip(st)+(pu.needsAttention?' <span class="pc-chip pc-p1">Needs attention</span>':'')+(stat.length?'<div class="pc-sub" style="margin-top:4px">'+stat.map(es).join(' · ')+'</div>':'')+(p.jobStatus?'<div class="pc-sub">'+es(p.jobStatus)+'</div>':'')+'</td>'+
        '<td>'+(es(p.permittingJurisdiction)||'<span class="pd-mut">—</span>')+'</td>'+
        '<td class="pc-nw">'+(_pdD(p.bldgPermitSubmitted)||'<span class="pd-mut">—</span>')+(p.bldgPermitNumber?'<div class="pc-sub">#'+es(p.bldgPermitNumber)+'</div>':'')+'</td>'+
        '<td class="pc-nw">'+(_pdD(p.bldgPermitIssued)?'<b class="pd-ok">'+_pdD(p.bldgPermitIssued)+'</b>':'<span class="pd-mut">—</span>')+'</td>'+
        '<td class="pc-nw">'+(d===null||st==='issued'?'<span class="pd-mut">—</span>':'<b style="color:'+(d>60?'#dc2626':d>30?'#d97706':'#16a34a')+'">'+d+'d</b>')+'</td>'+
        '<td class="pc-nw">'+(_pdHas(p.permitKickedBack)||_pdHas(p.permitResubmitted)?'<div class="pd-pair"><span><i>KB</i>'+(_pdD(p.permitKickedBack)||'—')+'</span><span><i>Resub</i>'+(_pdD(p.permitResubmitted)||'<span class="pd-wait">waiting</span>')+'</span></div>':'<span class="pd-mut">—</span>')+(p.permitKickbackNotes?'<div class="pc-sub" style="max-width:200px">'+es(p.permitKickbackNotes)+'</div>':'')+'</td>'+
        '<td>'+_pdRfi(p)+'</td>'+
        '<td>'+((_pdRecon(p)&&!_pdProgNoPlans(p))?_pdPair(p.surveyOrdered,p.surveyReceived):_pdNA())+'</td>'+
        '<td>'+((_pdRehab(p)||_pdProgNoPlans(p))?_pdNA():_pdPair(p.plansOrdered,p.plansReceived))+'</td><td>'+(_pdRehab(p)?_pdNA():_pdPair(p.trussOrdered,p.trussReceived))+'</td><td>'+(_pdRehab(p)?_pdNA():_pdPair(p.energyCalcsOrdered,p.energyCalcsReceived))+'</td>'+
        '<td style="min-width:160px;font-size:12px">'+(pu.thisWeek?es(pu.thisWeek):'<span class="pd-mut">—</span>')+'</td></tr>';
    });
    h+='</tbody></table></div>';
  }
  h+='</section>';
  root.innerHTML=h;
  const si=document.getElementById('pd-search');if(si&&document.activeElement!==si&&window._pdFocus){si.focus();}
  _pdWriteHash();
}
