// Client presentation and per-SOW cap calculations. No external writes.
const MONEY = '$ #,##0.00;[Red]($ #,##0.00);$ "-"';
const HOURS = '0.##;[Red](0.##);0';
const q = name => `'${name.replaceAll("'", "''")}'`;
const value = (s, cell, v) => { s.getRange(cell).values = [[v]]; };
const formula = (s, cell, f) => { s.getRange(cell).formulas = [[f]]; };
function base(sheet, widths, rows) {
  sheet.showGridLines = false;
  sheet.getRangeByIndexes(0, 0, rows, widths.length).format.font = {name:'Arial',size:11,color:'#253449'};
  sheet.getRangeByIndexes(0, 0, rows, widths.length).format.rowHeight = 23;
  widths.forEach((w, i) => {sheet.getRangeByIndexes(0,i,rows,1).format.columnWidth = w;});
}
function heading(sheet, address) {
  sheet.getRange(address).format.fill = '#253E58';
  sheet.getRange(address).format.font = {name:'Arial',size:11,bold:true,color:'#FFFFFF'};
  sheet.getRange(address).format.wrapText = true;
  sheet.getRange(address).format.rowHeight = 34;
}
function input(sheet,address) {sheet.getRange(address).format.fill='#FFF2CC';}
function total(sheet,address) {sheet.getRange(address).format.fill='#E8EEF4';sheet.getRange(address).format.font.bold=true;}

export function capAmounts(hours, rate, cap) {
  if (![hours,rate,cap].every(x=>typeof x==='number' && Number.isFinite(x) && x>=0)) throw new Error('Hours, rate and cap must be nonnegative numbers.');
  const gross=Math.round((hours*rate+Number.EPSILON)*100)/100;
  const chargedHours=Math.min(hours,cap), absorbedHours=hours-chargedHours;
  const net=Math.round((chargedHours*rate+Number.EPSILON)*100)/100;
  return {gross,discount:Math.round((gross-net)*100)/100,net,chargedHours,absorbedHours};
}

export function prepareClient(project) {
  const settings=project.client??{}, sows=settings.sows??[], categories=settings.categories??[];
  const unique=(rows,key,label)=>{const ids=rows.map(key);if(ids.some(x=>!x)||new Set(ids).size!==ids.length)throw new Error(`Missing or duplicate ${label}.`);};
  unique(sows,x=>x.id,'SOW IDs');unique(categories,x=>x.id,'client category IDs');
  const people=new Map((settings.contractors??[]).filter(x=>x.id).map(x=>[String(x.id),x.name]));
  const ids=new Set(), allocations=[];
  for(const e of project.entries) {
    if(!e.time_entry_id || ids.has(e.time_entry_id))throw new Error('Missing or duplicate time-entry ID in client report.');
    ids.add(e.time_entry_id);
    if(e.duration_valid===false || (e.period_status && e.period_status!=='In period'))continue;
    if(!Number.isSafeInteger(e.duration_ms)||e.duration_ms<0)throw new Error('Client report requires exact nonnegative duration milliseconds; rerun the schema v2 extraction.');
    if(!e.person_id)throw new Error('Client report requires contractor IDs.');
    const personID=String(e.person_id);if(!people.has(personID))people.set(personID,e.person);
    // Explicit task/entry rules take precedence over broader code rules.
    const rules=settings.allocations??[];
    let matching=rules.filter(r=>r.entry_id && String(r.entry_id)===e.time_entry_id);
    if(!matching.length)matching=rules.filter(r=>!r.entry_id && r.task_id && r.task_id===e.task_id);
    if(!matching.length)matching=rules.filter(r=>!r.entry_id&&!r.task_id&&r.field_id&&r.option_id&&r.field_id===e.project_code_field_id&&r.option_id===e.project_code_option_id);
    if(matching.length>1)throw new Error(`Ambiguous client allocation for entry ${e.time_entry_id}.`);
    const rule=matching[0], category=categories.find(c=>c.id===rule?.category_id);
    const sow=sows.find(s=>s.id===category?.sow_id);
    const mapped=Boolean(rule?.evidence && category && sow);
    allocations.push({entry:e,personID,person:people.get(personID),category:mapped?category:null,sow:mapped?sow:null,evidence:mapped?rule.evidence:''});
  }
  return {project,settings,sows,categories,people:[...people].map(([id,name])=>({id,name})),allocations};
}

export function buildClientSheets(workbook,dataset,projects,{template=false}={}) {
  const data=projects.map(prepareClient);
  const fronts=data.map(d=>workbook.worksheets.add(d.project.tab_name));
  const caps=workbook.worksheets.add('SOW caps'), detail=workbook.worksheets.add('Client detail');
  const capRows=data.flatMap(d=>d.sows.map(s=>({project:d.project.key,...s})));
  const records=data.flatMap(d=>d.allocations.map(a=>({project:d.project.key,...a})));
  const capEnd=Math.max(6+capRows.length,template?36:7), detailEnd=Math.max(6+records.length,template?506:7);
  const D=q(detail.name), C=q(caps.name);
  const dr=col=>`${D}!$${col}$7:$${col}$${detailEnd}`;
  const cr=col=>`${C}!$${col}$7:$${col}$${capEnd}`;
  base(caps,[18,14,42,16,16,18,45,15,19,19,19,17,27,30,22],capEnd+5);
  value(caps,'A2','SOW caps and absorbed costs');caps.getRange('A2').format.font.size=16;
  value(caps,'A3','Default hourly rate');value(caps,'B3',245);input(caps,'B3');caps.getRange('B3').format.numberFormat=MONEY;
  value(caps,'D3','Example cap (hours)');value(caps,'E3',297);input(caps,'E3');
  value(caps,'F3','Reference only. Confirm each SOW cap below.');
  value(caps,'A4','Caps apply separately to each SOW for this reporting period. Amber cells are editable.');
  caps.getRange('A6:O6').values=[['Project key','SOW ID','SOW name','Rate override','Rate / hour','Cap hours / period','Cap evidence / agreement','Hours logged','Gross cost','Discount (absorbed)','Net cost','Charged hours','Status','SOW key','Net cost / logged hour']];heading(caps,'A6:O6');
  for(let r=7;r<=capEnd;r++){
    const s=capRows[r-7];
    if(s){caps.getRange(`A${r}:D${r}`).values=[[s.project,s.id,s.name,s.rate??null]];caps.getRange(`F${r}:G${r}`).values=[[s.cap_hours??null,s.evidence??null]];}
    for(const col of ['A','B','C','D','F','G'])input(caps,`${col}${r}`);
    formula(caps,`N${r}`,`=IF(B${r}="","",A${r}&"|"&B${r})`);
    formula(caps,`E${r}`,`=IF(B${r}="","",IF(ISNUMBER(D${r}),D${r},IF(D${r}="",IF(ISNUMBER($B$3),$B$3,""),D${r})))`);
    formula(caps,`H${r}`,`=IF(B${r}="","",SUMIFS(${dr('X')},${dr('A')},A${r},${dr('K')},B${r},${dr('M')},"Mapped"))`);
    formula(caps,`I${r}`,`=IF(B${r}="","",IF(AND(ISNUMBER(E${r}),E${r}>=0),ROUND(H${r}*E${r},2),""))`);
    formula(caps,`M${r}`,`=IF(B${r}="","",IF(COUNTIF($N$7:$N$${capEnd},N${r})<>1,"Duplicate SOW",IF(H${r}=0,"No hours",IF(NOT(ISNUMBER(E${r})),"Confirm rate",IF(E${r}<0,"Invalid rate",IF(OR(NOT(ISNUMBER(F${r})),F${r}<0,G${r}=""),"Confirm cap","Ready"))))))`);
    formula(caps,`L${r}`,`=IF(M${r}="No hours",0,IF(M${r}="Ready",MIN(H${r},F${r}),""))`);
    formula(caps,`K${r}`,`=IF(ISNUMBER(L${r}),ROUND(L${r}*E${r},2),"")`);
    formula(caps,`O${r}`,`=IF(ISNUMBER(K${r}),IF(H${r}>0,K${r}/H${r},0),"")`);
    formula(caps,`J${r}`,`=IF(ISNUMBER(K${r}),ROUND(I${r}-K${r},2),"")`);
  }
  for(const col of ['D','E','I','J','K','O'])caps.getRange(`${col}7:${col}${capEnd}`).format.numberFormat=MONEY;
  for(const col of ['F','H','L'])caps.getRange(`${col}7:${col}${capEnd}`).format.numberFormat=HOURS;
  value(caps,`A${capEnd+2}`,'Charged hours = MIN(logged hours, cap). Discount = gross cost less net cost. Caps are never pooled.');
  caps.freezePanes.freezeRows(6);caps.freezePanes.freezeColumns(3);

  base(detail,[18,27,20,25,22,39,39,43,17,24,15,44,24,15,18,18,24,20,55,40,19,19,22,18],detailEnd);
  value(detail,'A2','Client detail and hours');detail.getRange('A2').format.font.size=16;
  value(detail,'A3','Edit Hours logged (column I) here only. All contractor, project and SOW totals roll up from these rows.');
  value(detail,'A4','Source duration ms preserves the original time. Record hour-change reasons in T; costs recalculate from SOW caps.');
  detail.getRange('A6:X6').values=[['Project key','Entry ID','Contractor ID','Contractor','Task ID','Code field ID','Code option ID','Project Code','Hours logged','Client project ID','SOW ID','Allocation evidence','Allocation status','Rate / hour','Gross cost','Source billable','Period status','Source duration ms','Task name','Hour-change reason','Net rate allocation','Net project cost','Hours check','Included hours']];heading(detail,'A6:X6');
  for(let r=7;r<=detailEnd;r++){
    const a=records[r-7];
    if(a){const e=a.entry;detail.getRange(`A${r}:H${r}`).values=[[a.project,`TE-${e.time_entry_id}`,`U-${a.personID}`,a.person,e.task_id,e.project_code_field_id??'',e.project_code_option_id??'',e.project_code??'']];detail.getRange(`J${r}:L${r}`).values=[[a.category?.id??'',a.sow?.id??'',a.evidence]];detail.getRange(`P${r}:S${r}`).values=[[e.billable,e.period_status??'In period',e.duration_ms,e.task_name]];}
    if(a)value(detail,`I${r}`,a.entry.duration_ms/3600000);
    formula(detail,`X${r}`,`=IF(B${r}="","",IF(AND(ISNUMBER(I${r}),I${r}>=0,Q${r}="In period"),I${r},""))`);
    formula(detail,`W${r}`,`=IF(B${r}="","",IF(OR(NOT(ISNUMBER(I${r})),I${r}<0),"Invalid hours",IF(NOT(ISNUMBER(R${r})),"Manual hours",IF(ROUND(I${r}*3600000,0)=R${r},"Source hours","Adjusted hours"))))`);
    formula(detail,`M${r}`,`=IF(B${r}="","",IF(W${r}="Invalid hours","Invalid hours",IF(NOT(ISNUMBER(X${r})),"Excluded",IF(AND(J${r}<>"",K${r}<>"",L${r}<>"",COUNTIF(${cr('N')},A${r}&"|"&K${r})=1),"Mapped","Needs allocation"))))`);
    formula(detail,`N${r}`,`=IF(B${r}="","",IF(M${r}="Mapped",_xlfn.XLOOKUP(A${r}&"|"&K${r},${cr('N')},${cr('E')},""),IF(ISNUMBER(${C}!$B$3),${C}!$B$3,"")))`);
    formula(detail,`O${r}`,`=IF(AND(ISNUMBER(X${r}),ISNUMBER(N${r}),N${r}>=0),X${r}*N${r},"")`);
    formula(detail,`U${r}`,`=IF(M${r}="Mapped",IF(OR(_xlfn.XLOOKUP(A${r}&"|"&K${r},${cr('N')},${cr('M')},"")="Ready",_xlfn.XLOOKUP(A${r}&"|"&K${r},${cr('N')},${cr('M')},"")="No hours"),_xlfn.XLOOKUP(A${r}&"|"&K${r},${cr('N')},${cr('O')},""),""),"")`);
    const cumulative=`SUMIFS($X$7:X${r},$A$7:A${r},A${r},$K$7:K${r},K${r},$M$7:M${r},"Mapped")`;
    // Differences of rounded cumulative shares conserve every SOW's net cents.
    formula(detail,`V${r}`,`=IF(AND(ISNUMBER(U${r}),ISNUMBER(X${r})),ROUND(${cumulative}*U${r},2)-ROUND((${cumulative}-X${r})*U${r},2),"")`);
  }
  input(detail,`I7:L${detailEnd}`);input(detail,`T7:T${detailEnd}`);
  if(template){input(detail,`A7:H${detailEnd}`);input(detail,`P7:S${detailEnd}`);}
  detail.getRange(`I7:I${detailEnd}`).format.numberFormat=HOURS;detail.getRange(`X7:X${detailEnd}`).format.numberFormat=HOURS;detail.getRange(`U7:V${detailEnd}`).format.numberFormat=MONEY;detail.getRange(`N7:O${detailEnd}`).format.numberFormat=MONEY;
  detail.freezePanes.freezeRows(6);detail.freezePanes.freezeColumns(4);

  const results=data.map((d,i)=>{
    const sheet=fronts[i], key=d.project.key.replaceAll('"','""');
    const people=d.people.length?d.people:[{id:'',name:'No time entries'}];
    const categories=d.categories;
    const end=6+Math.max(people.length,categories.length+1,10), sub=end+2;
    base(sheet,[25,16,20,4,51,16,22],sub+10);
    value(sheet,'A2',`${d.project.name} timesheet`);sheet.getRange('A2').format.font.size=16;
    value(sheet,'A3','Period start');value(sheet,'B3',template?null:new Date(`${dataset.run.start_date}T00:00:00Z`));
    value(sheet,'E3','Period end (exclusive)');value(sheet,'F3',template?null:new Date(`${dataset.run.end_date}T00:00:00Z`));
    sheet.getRange('B3').format.numberFormat='mmm d, yyyy';sheet.getRange('F3').format.numberFormat='mmm d, yyyy';
    if(template){input(sheet,'B3');input(sheet,'F3');}
    value(sheet,'A4',dataset.run.time_zone??'America/Chicago');
    value(sheet,'E4','Project costs include SOW cap discounts.');
    sheet.getRange('A6:C6').values=[['Contractor','Hours Logged','Dollars']];heading(sheet,'A6:C6');
    sheet.getRange('E6:G6').values=[['Project Name','Hours','Project Cost']];heading(sheet,'E6:G6');
    people.forEach((p,j)=>{const r=j+7, id=p.id.replaceAll('"','""');value(sheet,`A${r}`,p.name);formula(sheet,`B${r}`,`=SUMIFS(${dr('X')},${dr('A')},"${key}",${dr('C')},"U-${id}")`);formula(sheet,`C${r}`,`=ROUND(SUMIFS(${dr('O')},${dr('A')},"${key}",${dr('C')},"U-${id}"),2)`);});
    categories.forEach((c,j)=>{const r=j+7, id=c.id.replaceAll('"','""');value(sheet,`E${r}`,c.name);formula(sheet,`F${r}`,`=SUMIFS(${dr('X')},${dr('A')},"${key}",${dr('J')},"${id}")`);formula(sheet,`G${r}`,`=IF(ISNUMBER($G$${sub+1}),ROUND(SUMIFS(${dr('V')},${dr('A')},"${key}",${dr('J')},"${id}"),2),"")`);});
    const ur=categories.length+7;value(sheet,`E${ur}`,'Unallocated / other');
    formula(sheet,`F${ur}`,`=SUMIFS(${dr('X')},${dr('A')},"${key}")-${categories.length?`SUM(F7:F${ur-1})`:'0'}`);
    formula(sheet,`G${ur}`,`=IF(ABS(F${ur})<0.000000001,0,"")`);
    for(const [cell,label] of [[`A${sub}`,'Sub Total'],[`A${sub+1}`,'Discount (absorbed)'],[`A${sub+2}`,'Total Hours*'],[`E${sub}`,'Net subtotal'],[`E${sub+1}`,'Discount included'],[`E${sub+2}`,'Total Cost']])value(sheet,cell,label);
    formula(sheet,`B${sub}`,`=SUMIFS(${dr('X')},${dr('A')},"${key}")`);
    formula(sheet,`C${sub}`,`=ROUND(SUMIFS(${cr('I')},${cr('A')},"${key}")+SUMIFS(${dr('O')},${dr('A')},"${key}",${dr('M')},"Needs allocation"),2)`);
    formula(sheet,`F${sub}`,`=B${sub}`);formula(sheet,`G${sub}`,`=IF(ISNUMBER(G${sub+1}),SUM(G7:G${ur}),"")`);
    const ready=`AND(COUNTIFS(${dr('A')},"${key}",${dr('M')},"Invalid hours")=0,COUNTIFS(${dr('A')},"${key}",${dr('M')},"Needs allocation")=0,COUNTIFS(${cr('A')},"${key}",${cr('M')},"Confirm cap")+COUNTIFS(${cr('A')},"${key}",${cr('M')},"Confirm rate")+COUNTIFS(${cr('A')},"${key}",${cr('M')},"Invalid rate")+COUNTIFS(${cr('A')},"${key}",${cr('M')},"Duplicate SOW")=0,ABS(F${ur})<0.000000001)`;
    formula(sheet,`G${sub+1}`,`=IF(${ready},ROUND(SUMIFS(${cr('J')},${cr('A')},"${key}"),2),"Review detail / caps")`);
    formula(sheet,`G${sub+2}`,`=IF(ISNUMBER(G${sub+1}),G${sub},"")`);
    formula(sheet,`C${sub+1}`,`=G${sub+1}`);
    formula(sheet,`B${sub+2}`,`=IF(ISNUMBER(G${sub+1}),SUMIFS(${cr('L')},${cr('A')},"${key}"),"")`);
    formula(sheet,`B${sub+1}`,`=IF(ISNUMBER(B${sub+2}),B${sub}-B${sub+2},"")`);
    value(sheet,`A${sub+5}`,'*Charged hours after each SOW cap. Actual logged hours remain in Sub Total.');
    value(sheet,`A${sub+6}`,'Edit hours only in Client detail. Shared SOW caps are allocated by hours; discounts are already included in project costs.');
    sheet.getRange(`B7:B${sub+2}`).format.numberFormat=HOURS;sheet.getRange(`F7:F${sub+2}`).format.numberFormat=HOURS;
    sheet.getRange(`C7:C${sub+2}`).format.numberFormat=MONEY;sheet.getRange(`G7:G${sub+2}`).format.numberFormat=MONEY;
    sheet.getRange(`G${sub+1}`).format.wrapText=true;sheet.getRange(`C${sub+1}`).format.wrapText=true;sheet.getRange(`A${sub+1}:G${sub+1}`).format.rowHeight=34;
    for(const range of [`A${sub}:C${sub}`,`E${sub}:G${sub}`,`A${sub+2}:C${sub+2}`,`E${sub+2}:G${sub+2}`])total(sheet,range);
    return {sheet,usedRows:sub+6,maxColumns:7,sub};
  });
  return {results,support:[{sheet:caps,usedRows:capEnd+2,maxColumns:15},{sheet:detail,usedRows:detailEnd,maxColumns:24}]};
}
