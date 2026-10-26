import assert from 'node:assert/strict';
import test from 'node:test';
import {findProjectCode,normalizeEntry,validEntries,periodStatus} from '../scripts/clickup-project-timesheet.mjs';
import {prepareHandoff,allocationTreatment,localSpreadsheetDate} from '../scripts/qbo-handoff.mjs';
const field={id:'field',name:'Project Code',type:'drop_down',type_config:{options:[{id:'opt',orderindex:0,name:'BT-S12'},{id:'legacy',orderindex:1,name:'LEGACY — review allocation'}]},value:0};
const project={key:'battlestar',name:'Project Battlestar',tab_name:'Project Battlestar'};
test('dropdown zero resolves and stable IDs survive; child never inherits parent',()=>{
  const parent={id:'p',custom_fields:[field]},child={id:'c',parent:'p',custom_fields:[{...field,value:1}]};
  assert.equal(findProjectCode(parent,'Project Code').project_code_option_id,'opt');
  const e=normalizeEntry({id:'1000000000000000001',task:{id:'c'},start:'1790638891829',end:'1790639891829',duration:'5697867',billable:false},project,{id:'space'},new Map([['p',parent],['c',child]]),'America/Chicago','Project Code');
  assert.equal(e.project_code_option_id,'legacy');assert.equal(e.parent_task_id,'p');assert.equal(e.duration_ms,5697867);assert.equal(e.end_ms,1790639891829);assert.equal(e.billable,'No');assert.equal(e.hours,5697867/3600000);
  assert.equal(findProjectCode({...child,custom_fields:[]},'Project Code').is_coded,false);
  assert.equal(findProjectCode({...parent,custom_fields:[{...field,value:'BT-S12'}]},'Project Code').is_coded,false);
});
test('null, blank and running durations remain exceptions; zero is valid',()=>{
  for(const duration of [null,undefined,'',-100])assert.equal(normalizeEntry({duration},project,{},new Map(),'America/Chicago','Project Code').duration_valid,false);
  assert.equal(normalizeEntry({duration:0},project,{},new Map(),'America/Chicago','Project Code').duration_valid,true);
  assert.equal(validEntries([{hours:null},{hours:1,period_status:'Outside period'},{hours:1,period_status:'In period'}]).length,1);
});
test('holds remain holds; no source flag becomes a billing approval',()=>{
  assert.equal(allocationTreatment('Pending allocation — do not invoice'),'Hold');assert.equal(allocationTreatment('LEGACY — Battlestar Main — review allocation'),'Hold');assert.equal(allocationTreatment('BT-S12'),'Review');
  const data={schema_version:2,projects:[{...project,entries:[{time_entry_id:'1',duration_valid:true,duration_ms:1,billable:'No',is_coded:true,project_code_field_id:'f',project_code_option_id:'o',project_code:'BT-S12'}]}]};
  const result=prepareHandoff(data,'battlestar');assert.equal(result.entries[0].billable,'No');assert.equal(result.codes[0].treatment,'Review');assert.equal(result.codes[0].sow_id,undefined);
  assert.throws(()=>prepareHandoff({...data,schema_version:1},'battlestar'),/schema_version 2/);
  data.projects[0].entries.push({...data.projects[0].entries[0]});assert.throws(()=>prepareHandoff(data,'battlestar'),/duplicate/);
});
test('local spreadsheet timestamps respect Chicago and DST',()=>{
  assert.equal(localSpreadsheetDate(Date.parse('2026-09-01T05:00:00Z'),'America/Chicago').toISOString(),'2026-09-01T00:00:00.000Z');
  assert.equal(localSpreadsheetDate(Date.parse('2026-12-01T06:00:00Z'),'America/Chicago').toISOString(),'2026-12-01T00:00:00.000Z');
});
test('period start is inclusive and period end is exclusive',()=>{
  const start=Date.parse('2026-09-01T05:00:00Z'), end=Date.parse('2026-10-01T05:00:00Z');
  assert.equal(periodStatus(start,start,end),'In period');
  assert.equal(periodStatus(start-1,start,end),'Outside period');
  assert.equal(periodStatus(end-1,start,end),'In period');
  assert.equal(periodStatus(end,start,end),'Outside period');
  assert.equal(periodStatus(null,start,end),'Invalid start');
});
test('capacity overflow stops without truncating entries',()=>{
  const entries=Array.from({length:501},(_,i)=>({time_entry_id:String(i),duration_valid:true,duration_ms:1}));
  assert.throws(()=>prepareHandoff({schema_version:2,projects:[{...project,entries}]},'battlestar'),/No entries were truncated/);
});
