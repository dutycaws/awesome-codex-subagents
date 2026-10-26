import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
import {writeQboHandoff} from '../scripts/qbo-handoff.mjs';

test('saved handoff preserves source values and leaves QBO/billing decisions unconfirmed', async()=>{
  const template=new URL('../assets/qbo-timesheet-template.xlsx',import.meta.url).pathname;
  const before=await fs.readFile(template);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qbo-handoff-test-'));
  try{
    const entry={project:'Project Battlestar',time_entry_id:'5283110388471998958',person:'Test Person',person_id:'123',task_id:'task',parent_task_id:'parent',task_name:'Source task',task_url:'https://app.clickup.com/t/task',task_status:'done',work_date:'2026-09-01',start_ms:Date.parse('2026-09-01T05:00:00Z'),end_ms:Date.parse('2026-09-01T06:34:57.867Z'),duration_ms:5697867,duration_valid:true,duration_status:'Complete',hours:5697867/3600000,billable:'No',description:'',project_code_field_id:'field',project_code_option_id:'option',project_code:'LEGACY — review allocation',coding_status:'Coded',is_coded:true};
    const dataset={schema_version:2,run:{start_date:'2026-09-01',end_date:'2026-10-01',time_zone:'America/Chicago',workspace_id:'12345',generated_at_ms:Date.parse('2026-10-01T12:00:00Z')},projects:[{key:'battlestar',name:'Project Battlestar',entries:[entry]}]};
    const target=path.join(dir,'handoff.xlsx');
    await writeQboHandoff(dataset,'battlestar',template,target);
    const w=await SpreadsheetFile.importXlsx(await FileBlob.load(target));w.recalculate();
    const t=w.worksheets.getItem('Time entries'),r=w.worksheets.getItem('Estimate review'),c=w.worksheets.getItem('Project codes');
    assert.equal(t.getRange('A7').values[0][0],'TE-5283110388471998958');
    assert.equal(t.getRange('N7').values[0][0],5697867);
    assert.equal(t.getRange('F7').values[0][0],5697867/3600000);
    assert.equal(t.getRange('T7').values[0][0],'No');
    assert.ok([null,''].includes(t.getRange('G7').values[0][0]));
    assert.equal(t.getRange('D7').values[0][0],'');
    assert.equal(c.getRange('F7').values[0][0],'Hold');
    assert.equal(t.getRange('I7').values[0][0],'Review: allocation hold');
    assert.equal(r.getRange('G43').values[0][0],'');
    assert.ok([null,''].includes(r.getRange('B4').values[0][0]));
    assert.deepEqual(await fs.readFile(template),before);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
