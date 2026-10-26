import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Workbook,SpreadsheetFile,FileBlob} from '@oai/artifact-tool';
import {capAmounts,prepareClient,buildClientSheets} from '../scripts/client-timesheet.mjs';

const entry=(id,ms,task='task')=>({time_entry_id:id,person_id:'1',person:'Contractor',task_id:task,duration_ms:ms,duration_valid:true,period_status:'In period',billable:'No',project_code_field_id:'f',project_code_option_id:'o',project_code:'BT-P1',task_name:'Does not prove allocation'});
function fixture(){
  return {key:'battlestar',name:'Project Battlestar',tab_name:'Project Battlestar',entries:[entry('1',12.1*3600000),entry('2',2*3600000,'other')],client:{contractors:[{id:'2',name:'Contractor'}],categories:[{id:'salesforce',name:'Salesforce',sow_id:'s1'},{id:'zoom',name:'Zoom',sow_id:'s1'}],sows:[{id:'s1',name:'Phase 1',cap_hours:10,evidence:'Confirmed contract'}],allocations:[{field_id:'f',option_id:'o',category_id:'salesforce',evidence:'Confirmed code'},{task_id:'other',category_id:'zoom',evidence:'Confirmed task'}]}};
}
test('caps are independent, preserve fractional hours and accept a confirmed zero',()=>{
  assert.deepEqual(capAmounts(474,245,297),{gross:116130,discount:43365,net:72765,chargedHours:297,absorbedHours:177});
  assert.equal(capAmounts(12.1,245,10).net,2450);
  assert.equal(capAmounts(2,245,10).discount,0);
  assert.equal(capAmounts(2,245,0).discount,490);
  assert.equal(capAmounts(2,0,1).chargedHours,1);
  assert.throws(()=>capAmounts(2,245,null));
  assert.equal(capAmounts(12,245,10).discount+capAmounts(2,245,10).discount,490);
});
test('identity, explicit allocation precedence, duplicate and unmapped handling',()=>{
  const p=fixture(), result=prepareClient(p);
  assert.equal(result.people.length,2); // same display name, distinct IDs
  assert.equal(result.allocations[1].category.id,'zoom');
  assert.equal(result.allocations[0].entry.billable,'No');
  p.client.allocations=[];assert.equal(prepareClient(p).allocations[0].category,null);
  p.entries.push({...p.entries[0]});assert.throws(()=>prepareClient(p),/duplicate/);
  const ambiguous=fixture();ambiguous.client.allocations.push({...ambiguous.client.allocations[0]});assert.throws(()=>prepareClient(ambiguous),/Ambiguous/);
  const excluded=fixture();excluded.entries.push({...entry('3',1000),period_status:'Outside period'},{...entry('4',null),duration_valid:false});assert.equal(prepareClient(excluded).allocations.length,2);
});

test('workbook keeps independent SOW caps even when total capacity exceeds total time',()=>{
  const p=fixture();p.client.categories[1].sow_id='s2';p.client.sows.push({id:'s2',name:'Other SOW',cap_hours:10,evidence:'Confirmed'});
  const w=Workbook.create(), built=buildClientSheets(w,{run:{start_date:'2026-09-01',end_date:'2026-10-01'}},[p]);w.recalculate();
  const s=built.results[0].sheet,sub=built.results[0].sub;
  assert.equal(s.getRange(`B${sub+2}`).values[0][0],12);
  assert.equal(s.getRange(`G${sub+1}`).values[0][0],514.5);
  assert.equal(s.getRange(`G${sub+2}`).values[0][0],2940);
});
test('editable SOW caps recalculate summary and saved workbook; missing inputs stay visible',async()=>{
  const p=fixture(), w=Workbook.create();
  const built=buildClientSheets(w,{run:{start_date:'2026-09-01',end_date:'2026-10-01',time_zone:'America/Chicago'}},[p]);
  const c=w.worksheets.getItem('SOW caps'),s=built.results[0].sheet,d=w.worksheets.getItem('Client detail'),sub=built.results[0].sub;
  const v=(sh,cell)=>sh.getRange(cell).values[0][0];
  w.recalculate();
  assert.equal(v(c,'H7'),14.1);assert.equal(v(c,'J7'),1004.5);assert.equal(v(c,'K7'),2450);
  assert.equal(v(s,`G${sub+2}`),2450);assert.equal(v(s,`B${sub}`),14.1);
  assert.equal(v(s,'G7')+v(s,'G8'),2450);
  const originalMs=v(d,'R7');
  d.getRange('I7').values=[[4]];w.recalculate();
  assert.equal(v(s,'B8'),6);assert.equal(v(s,'F7'),4);assert.equal(v(c,'H7'),6);
  assert.equal(v(s,'G7'),980);assert.equal(v(s,'G8'),490);assert.equal(v(s,`G${sub+2}`),1470);
  assert.equal(v(d,'R7'),originalMs);assert.equal(v(d,'W7'),'Adjusted hours');
  d.getRange('I7').values=[[20]];w.recalculate();
  assert.equal(v(s,'G7'),2227.27);assert.equal(v(s,'G8'),222.73);assert.equal(v(s,`G${sub+2}`),2450);
  d.getRange('I7').values=[[-1]];w.recalculate();assert.equal(v(d,'W7'),'Invalid hours');assert.equal(v(s,`G${sub+2}`),'');
  d.getRange('I7').values=[[0]];w.recalculate();assert.equal(v(s,'F7'),0);assert.equal(v(s,'G7'),0);assert.equal(v(s,`G${sub+2}`),490);
  d.getRange('I7').values=[[12.1]];w.recalculate();
  c.getRange('F7').values=[[0]];w.recalculate();assert.equal(v(s,`G${sub+2}`),0);assert.equal(v(c,'J7'),3454.5);
  c.getRange('F7').values=[[20]];c.getRange('B3').values=[[200]];w.recalculate();assert.equal(v(s,`G${sub+2}`),2820);
  assert.equal(v(s,'G7'),2420);assert.equal(v(s,'G8'),400);
  c.getRange('F7').clear({applyTo:'contents'});w.recalculate();assert.equal(v(c,'M7'),'Confirm cap');assert.equal(v(s,`G${sub+2}`),'');
  c.getRange('F7').values=[[10]];d.getRange('L7').clear({applyTo:'contents'});w.recalculate();assert.equal(v(s,`G${sub+2}`),'');
  d.getRange('L7').values=[['Confirmed']];c.getRange('D7').values=[[0]];w.recalculate();assert.equal(v(s,`B${sub+2}`),10);assert.equal(v(s,`G${sub+2}`),0);
  c.getRange('D7').clear({applyTo:'contents'});w.recalculate();
  c.getRange('B3').clear({applyTo:'contents'});w.recalculate();assert.equal(v(c,'M7'),'Confirm rate');assert.equal(v(s,`G${sub+2}`),'');
  c.getRange('B3').values=[[200]];w.recalculate();
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'client-timesheet-test-'));
  try{
    const out=path.join(dir,'client.xlsx');await(await SpreadsheetFile.exportXlsx(w)).save(out);
    const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(out));reopened.recalculate();
    assert.equal(v(reopened.worksheets.getItem(p.tab_name),`G${sub+2}`),2000);
    assert.equal(v(reopened.worksheets.getItem('Client detail'),'P7'),'No');
    const rd=reopened.worksheets.getItem('Client detail');rd.getRange('I7').values=[[3]];reopened.recalculate();
    assert.equal(v(reopened.worksheets.getItem(p.tab_name),'F7'),3);
    assert.equal(v(reopened.worksheets.getItem(p.tab_name),`G${sub+2}`),1000);
    assert.equal(v(rd,'R7'),originalMs);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
