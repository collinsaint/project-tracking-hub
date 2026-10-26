// ===== Permit dashboard (replaces the old Permitting queue; Permitting Updates sheet is separate) =====
let permDash={owner:'',stage:'open',search:'',program:'',jur:'',sort:'',dir:1};
const PD_STAGES=[
  ['open','Open permits','Not yet issued','pc-cw'],
  ['ready','Ready — pending permit','Only permit left','pd-cg'],
  ['none','Not submitted','Waiting on submittal','pc-c2'],
  ['review','In review','Submitted / resubmitted','pc-cw'],
  ['kicked','Kicked back','Awaiting resubmittal','pc-c1'],
  ['issued','Issued','Building permit issued','pd-ct'],
  ['hold','On hold','Not counted above','pc-cn']
];
function pdHold(p){return /hold/i.test(p.jobStatus||'');}
function pdStageOk(p){const h=pdHold(p);if(permDash.stage==='hold')return h;if(h)return false;const s=pdStage(p);return permDash.stage==='all'||(permDash.stage==='ready'?pdReady(p):permDash.stage==='open'?s!=='issued':s===permDash.stage);}
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
function pdReady(p){if(pdStage(p)==='issued')return false;const js=p.jobStatus||'';return /pending permit|pending start \(permitting|^20\b|pending construction start/i.test(js)||_pdHas(p.ntp);}
function pdOwner(p){return String(p.permitAssigned||'').trim();}
function pdNeedsPermit(p){
  const lc=v=>String(v||'').trim().toLowerCase();
  if(lc(p.readyToStart)==='no permits needed')return false;
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
  return'<div class="pd-pair"><span><i>O</i>'+(O||'<span class="pd-mut">—</span>')+'</span><span><i>R</i>'+(R?'<b class="pd-ok">'+R+'</b>':'<span class="pd-wait">wait</span>')+'</span></div>';
}
function _pdStageChip(st){const m={none:['Not submitted','pc-p2'],review:['In review','pc-pw'],kicked:['Kicked back','pc-p1'],issued:['Issued','pd-pi']};const x=m[st];return'<span class="pc-chip '+x[1]+'">'+x[0]+'</span>';}
function _pdDays(p){const src=p.permitResubmitted&&_pdHas(p.permitResubmitted)?p.permitResubmitted:p.bldgPermitSubmitted;if(!_pdHas(src)||src==='N/A')return null;const d=Math.floor((Date.now()-new Date(src))/86400000);return d>=0?d:null;}
function _pdNA(){return'<span class="pd-na">N/A</span>';}
function _pdProgNoPlans(p){return /rebuild\s*f(l|lorida)|pinellas/i.test(p.program||'');}
function _pdRehab(p){return /rehab/i.test(p.jobType||'');}
function _pdRecon(p){return /recon|mhu|replace/i.test(p.jobType||'');}
function _pdYes(v){return v===true||/^(y|yes|true|x|checked|1)$/i.test(String(v==null?'':v).trim());}
function _pdRfi(p){
  const one=(n,rq,rc,lbl,main)=>{const y=_pdYes(n),q=_pdHas(rq)&&rq!=='N/A',c=_pdHas(rc)&&rc!=='N/A';
    if(!y&&!q&&!c)return main?'<div><span class="pd-mut">'+lbl+' not needed</span></div>':'';
    let h='<div><span class="pc-chip '+(c?'pd-pi':q?'pc-p2':'pc-p1')+'">'+lbl+(c?' received':q?' requested':' needed')+'</span></div>';
    if(q)h+='<div class="pd-pw"><i>Req</i>'+_pdD(rq)+'</div>';if(c)h+='<div class="pd-pw"><i>Rcvd</i><b class="pd-ok">'+_pdD(rc)+'</b></div>';return h;};
  return one(p.rfiNeeded,p.rfiRequested,p.rfiReceived,'RFI',1)+one(p.addlRfiNeeded,p.addlRfiRequested,p.addlRfiReceived,'Add\'l RFI',0);
}
function _pdSeptic(p){
  const st=[p.septic].filter(v=>v&&!/^unknown$/i.test(v)).filter((v,i,a)=>a.indexOf(v)===i);
  const iss=_pdD(p.septicPermitIssued);
  if(!st.length&&!iss)return'<span class="pd-mut">—</span>';
  return'<div class="pd-pair">'+(st.length?'<span>'+st.map(es).join(' · ')+'</span>':'')+'<span><i>Prm</i>'+(iss?'<b class="pd-ok">'+iss+'</b>':'<span class="pd-mut">—</span>')+'</span></div>';
}
function _pdMhu(p){return /mhu|replace/i.test(p.jobType||'');}
function _pdOut(p){const rh=_pdRehab(p),np=_pdProgNoPlans(p),o=[],nr=v=>!(_pdHas(v)&&v!=='N/A');
  if(!(!(_pdRecon(p)&&!np))&&nr(p.surveyReceived))o.push('Survey/EC');if(!(rh||np)&&nr(p.plansReceived))o.push('Plans');
  if(!(rh||_pdMhu(p))&&nr(p.trussReceived))o.push('Truss');if(!(rh||_pdMhu(p))&&nr(p.energyCalcsReceived))o.push('Energy');
  if(_pdYes(p.rfiNeeded)&&nr(p.rfiReceived))o.push('RFI');if(_pdYes(p.addlRfiNeeded)&&nr(p.addlRfiReceived))o.push("Add'l RFI");return o;}
function _pdPaper(p){
  const ln=(l,na,O,R)=>{if(na)return'<div class="pd-pw"><i>'+l+'</i>'+_pdNA()+'</div>';const o=_pdD(O),r=_pdD(R);return'<div class="pd-pw"><i>'+l+'</i>'+(o||(r?'<span class="pd-miss">MISSING</span>':'<span class="pd-mut">—</span>'))+' / '+(r?'<b class="pd-ok">'+r+'</b>':(o?'<span class="pd-wait">wait</span>':'<span class="pd-need">NEEDED</span>'))+'</div>';};
  const rh=_pdRehab(p),np=_pdProgNoPlans(p);
  return ln('Svy/EC',!(_pdRecon(p)&&!np),p.surveyOrdered,p.surveyReceived)+ln('Plans',rh||np,p.plansOrdered,p.plansReceived)+ln('Truss',rh||_pdMhu(p),p.trussOrdered,p.trussReceived)+ln('Energy',rh||_pdMhu(p),p.energyCalcsOrdered,p.energyCalcsReceived);
}
function renderPerm(){
  const root=document.getElementById('pd-root');if(!root)return;
  const base=pdBase();
  const fs=permDash.search.toLowerCase();
  const pre=base.filter(p=>{
    if(permDash.program&&p.program!==permDash.program)return false;
    if(permDash.jur&&p.permittingJurisdiction!==permDash.jur)return false;
    if(fs){const hay=[pname(p),p.address,p.city,p.firstName,p.lastName,p.projectNumber,p.jobPrefix,p.prefix,p.appId,p.bldgPermitNumber,p.permittingJurisdiction,p.jobType,p.jobStatus,p.bldgPermitStatus,p.permitStatus,p.program,p.groups,p.jobGroups,pdOwner(p)].filter(Boolean).join(' ').toLowerCase();if(!hay.includes(fs))return false;}
    return true;
  });
  const byOwner=pre.filter(p=>!permDash.owner||(permDash.owner==='__none'?!pdOwner(p):pdOwner(p)===permDash.owner));
  const cnt={ready:0,open:0,none:0,review:0,kicked:0,issued:0,hold:0};
  byOwner.forEach(p=>{if(pdHold(p)){cnt.hold++;return;}const s=pdStage(p);cnt[s]++;if(s!=='issued')cnt.open++;if(pdReady(p))cnt.ready++;});
  let rows=byOwner.filter(pdStageOk);
  // owner chips (counts within current stage + other filters)
  const stageOk=pdStageOk;
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
    if(!sk){const r=(pdReady(b)?1:0)-(pdReady(a)?1:0);if(r)return r;const c=ord[pdStage(a)]-ord[pdStage(b)];if(c)return c;return (_pdDays(b)??-1)-(_pdDays(a)??-1);}
    const av=sv(a),bv=sv(b);if(typeof av==='number')return sd*(av-bv);
    if(av===''&&bv!=='')return 1;if(bv===''&&av!=='')return -1;return sd*String(av).localeCompare(String(bv));
  });
  const th=(k,l)=>'<th class="'+(k?'pd-s':'')+(sk===k&&k?(sd===1?' sa':' sd'):'')+'"'+(k?' onclick="pdSort(\''+k+'\')"':'')+'>'+l+'</th>';
  const anyF=permDash.owner||permDash.search||permDash.program||permDash.jur||permDash.stage!=='open';
  const ownerLbl=permDash.owner==='__none'?'Unassigned':permDash.owner;
  let h='<div class="pc-top"><div class="pc-top-t"><h2>Permitting</h2><p>Permit status, owners and paperwork for every active job'+(ownerLbl?' · <b>'+es(ownerLbl)+'</b>':'')+'</p></div>'+
    '<div class="pc-top-act"><button class="btn pc-ol" onclick="openPermUpdView()">Permitting Updates sheet</button></div></div>';
  h+='<div class="pc-cards pd-cards">'+PD_STAGES.map(([k,l,s,c])=>'<button class="pc-card '+c+(permDash.stage===k?' on':'')+'" onclick="pdSet(\'stage\',\''+k+'\')"><span class="pc-cl">'+l+'</span><b>'+cnt[k]+'</b><span class="pc-cs">'+s+'</span></button>').join('')+'</div>';
  {const act=base.filter(p=>!pdHold(p)),bar=(t,sub,rows,col)=>{const m=Math.max(1,...rows.map(r=>r[1]));return'<section class="pc-chart pd-ch"><h4>'+t+' <span>'+sub+'</span></h4>'+(rows.length?rows.map(r=>'<div class="pd-br"'+(r[2]?' onclick="'+r[2]+'" style="cursor:pointer"':'')+'><span class="pd-bl" title="'+es(r[0])+'">'+es(r[0])+'</span><span class="pd-bt"><span style="width:'+(r[1]/m*100)+'%;background:'+col+'"></span></span><b>'+r[1]+'</b></div>').join(''):'<div class="pd-mut">None</div>')+'</section>';},
   grp=(f)=>{const o={};act.forEach(p=>{const k=f(p)||'—';o[k]=(o[k]||0)+1;});return Object.entries(o).sort((x,y)=>y[1]-x[1]).slice(0,8);};
   const stg=PD_STAGES.filter(x=>!['all','open','ready','hold'].includes(x[0])).map(([k,l])=>[l,act.filter(p=>pdStage(p)===k).length,"pdSet('stage','"+k+"')"]).filter(r=>r[1]);
   const oc={};act.filter(p=>pdStage(p)!=='issued').forEach(p=>_pdOut(p).forEach(k=>oc[k]=(oc[k]||0)+1));
   h+='<div class="pd-charts">'+bar('By stage','active jobs · click to filter',stg,'#0d3b6e')+bar('By owner','active jobs',grp(pdOwner),'#2563eb')+bar('By program','active jobs',grp(p=>p.program).map(r=>[r[0],r[1],r[0]!=='—'?"pdSet('program','"+String(r[0]).replace(/'/g,"\\'")+"')":'']),'#0891b2')+bar('Outstanding paperwork','needed, not received · not yet issued',Object.entries(oc).sort((x,y)=>y[1]-x[1]),'#dc2626')+'</div>';}
  h+='<div class="pd-filt"><div class="pd-frow"><div class="pc-search pd-search"><span>&#9906;</span><input id="pd-search" placeholder="Search job, address, homeowner, ID, permit #, jurisdiction, type, status, program, owner" value="'+es(permDash.search)+'" oninput="permDash.search=this.value;clearTimeout(window._pdT);window._pdT=setTimeout(renderPerm,200)"></div>'+
    '<select class="pd-sel" onchange="pdSet(\'program\',this.value)" title="Program">'+opts(base.map(p=>p.program),permDash.program).replace('>All<','>All programs<')+'</select>'+
    '<select class="pd-sel" onchange="pdSet(\'jur\',this.value)" title="Jurisdiction">'+opts(base.map(p=>p.permittingJurisdiction),permDash.jur).replace('>All<','>All jurisdictions<')+'</select>'+
    '<button class="pd-tog'+(permDash.stage==='all'?' on':'')+'" onclick="pdSet(\'stage\',\''+(permDash.stage==='all'?'open':'all')+'\')">Include issued</button>'+
    (anyF?'<button class="pc-clear" onclick="pdClear()">Clear filters</button>':'')+'</div>'+
    '<div class="pd-frow pd-orow"><span class="pd-fl">Owner</span><div class="pd-chips">'+chip('','All',totStage)+owners.map(o=>chip(o,o,oc[o]||0)).join('')+chip('__none','Unassigned',un)+'</div></div></div>';
  h+='<section class="pc-panel"><header><h3>Permit queue</h3><span class="pc-count">'+rows.length+'</span><span class="pc-hsub">Click a job to open it. Dates come from the Buildertrend import.</span></header>';
  if(!rows.length)h+='<div class="pc-none">No jobs match these filters.</div>';
  else{
    h+='<div class="pc-tw pd-tw"><table class="pc-q pd-q"><thead><tr>'+th('job','Job')+th('jobType','Type')+th('owner','Owner')+th('','Status')+th('bldgPermitSubmitted','Subm.')+th('bldgPermitIssued','Issued')+th('days','Days')+th('permitKickedBack','KB / Resub')+th('septicPermitIssued','Septic')+th('','RFI')+th('','Paperwork <span class="pd-mut">O / R</span>')+'</tr></thead>';
    rows.forEach(p=>{
      const idx=proj.indexOf(p),st=pdStage(p),o=pdOwner(p),d=_pdDays(p),pu=(typeof puData!=='undefined'&&puData[p.address])||{};
      const hm=((p.firstName||'')+' '+(p.lastName||'')).trim();
      const stat=[p.bldgPermitStatus,p.permitStatus].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
      const _o=_pdOut(p);h+='<tbody class="pd-grp'+(_o.length?' pd-out':'')+'" title="'+(_o.length?'Outstanding: '+_o.join(', '):'')+'"><tr class="'+(pu.thisWeek?'pd-hasn':'')+'" onclick="od('+idx+')" style="cursor:pointer">'+
        '<td><div class="pc-job">'+es(pname(p)||'No address')+'</div>'+(_o.length?'<div class="pd-outc">Needs: '+es(_o.join(', '))+'</div>':'')+'<div class="pc-sub">'+es([p.projectNumber,p.city,hm].filter(Boolean).join(' · '))+'</div>'+(p.permittingJurisdiction?'<div class="pc-sub pd-jur" title="Jurisdiction">&#9873; '+es(p.permittingJurisdiction)+'</div>':'')+(pu.thisWeek?'':'<button class="pd-nb" onclick="event.stopPropagation();pdEditNote('+idx+')">+ Week note</button>')+'<div style="margin-top:4px">'+(p.program?'<span class="pc-prog">'+es(p.program)+'</span>':'')+'</div></td>'+
        '<td class="pd-tr" style="max-width:90px" title="'+es(p.jobType||'')+'">'+(p.jobType?es(p.jobType):'<span class="pd-mut">—</span>')+'</td>'+'<td class="pc-nw">'+(o?'<span class="pd-own">'+es(o)+'</span>':'<span class="pd-mut">Unassigned</span>')+'</td>'+
        '<td>'+(pdReady(p)?'<span class="pc-chip pd-rdy">Ready — pending permit</span> ':'')+_pdStageChip(st)+(pu.needsAttention?' <span class="pc-chip pc-p1">Needs attention</span>':'')+(stat.length?'<div class="pc-sub pd-tr" style="margin-top:4px" title="'+es(stat.join(' · '))+'">'+stat.map(es).join(' · ')+'</div>':'')+(p.jobStatus?'<div class="pc-sub pd-tr" title="'+es(p.jobStatus)+'">'+es(p.jobStatus)+'</div>':'')+'</td>'+
                '<td class="pc-nw">'+(_pdD(p.bldgPermitSubmitted)||'<span class="pd-mut">—</span>')+(p.bldgPermitNumber?'<div class="pc-sub">#'+es(p.bldgPermitNumber)+'</div>':'')+'</td>'+
        '<td class="pc-nw">'+(_pdD(p.bldgPermitIssued)?'<b class="pd-ok">'+_pdD(p.bldgPermitIssued)+'</b>':'<span class="pd-mut">—</span>')+'</td>'+
        '<td class="pc-nw">'+(d===null||st==='issued'?'<span class="pd-mut">—</span>':'<b style="color:'+(d>60?'#dc2626':d>30?'#d97706':'#16a34a')+'">'+d+'d</b>')+'</td>'+
        '<td class="pc-nw">'+(_pdHas(p.permitKickedBack)||_pdHas(p.permitResubmitted)?'<div class="pd-pair"><span><i>KB</i>'+(_pdD(p.permitKickedBack)||'—')+'</span><span><i>Resub</i>'+(_pdD(p.permitResubmitted)||'<span class="pd-wait">wait</span>')+'</span></div>':'<span class="pd-mut">—</span>')+(p.permitKickbackNotes?'<div class="pc-sub pd-tr" title="'+es(p.permitKickbackNotes)+'">'+es(p.permitKickbackNotes)+'</div>':'')+'</td>'+
        '<td>'+_pdSeptic(p)+'</td>'+
        '<td>'+_pdRfi(p)+'</td>'+
        '<td>'+_pdPaper(p)+'</td>'+
        '</tr>'+(pu.thisWeek?'<tr class="pd-note" onclick="od('+idx+')"><td colspan="11" id="pdn-'+idx+'"><span class="pd-nl">This week'+(pu.thisWeekSavedAt?' · '+(_pdD(pu.thisWeekSavedAt)||es(pu.thisWeekSavedAt)):'')+'</span>'+es(pu.thisWeek)+' <button class="pd-nb" onclick="event.stopPropagation();pdEditNote('+idx+')">&#9998; Edit</button></td></tr>':'<tr class="pd-note pd-note0" id="pdr-'+idx+'" style="display:none"><td colspan="11" id="pdn-'+idx+'"></td></tr>')+'</tbody>';
    });
    h+='</table></div>';
  }
  h+='</section>';
  root.innerHTML=h;
  const si=document.getElementById('pd-search');if(si&&document.activeElement!==si&&window._pdFocus){si.focus();}
  _pdWriteHash();
}

function pdEditNote(idx){
  const p=proj[idx];if(!p)return;const addr=p.address;
  const td=document.getElementById('pdn-'+idx);if(!td)return;
  const r=document.getElementById('pdr-'+idx);if(r)r.style.display='';
  const cur=((typeof puData!=='undefined'&&puData[addr])||{}).thisWeek||'';
  const sun=puGetSunday(0);
  td.onclick=e=>e.stopPropagation();
  td.innerHTML='<span class="pd-nl">Week ending '+es(puSundayLabel(sun))+'</span><textarea class="pd-nta" placeholder="Enter permit update for this week...">'+es(cur)+'</textarea><div class="pd-nact"><button class="pd-nb pd-nsv">Save</button><button class="pd-nb">Cancel</button></div>';
  const ta=td.querySelector('textarea'),[sv,cn]=td.querySelectorAll('.pd-nact button');
  ta.focus();
  cn.onclick=e=>{e.stopPropagation();renderPerm();};
  sv.onclick=async e=>{e.stopPropagation();sv.disabled=true;sv.textContent='Saving…';
    await savePuUpdate(addr,'puThisWeek',ta.value.trim(),puSundayKey(sun));
    if(typeof renderPuTable==='function'){try{renderPuTable();}catch(_){}}
    renderPerm();};
}
