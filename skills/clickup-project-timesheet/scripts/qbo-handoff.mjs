import fs from 'node:fs/promises';
import path from 'node:path';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';

export const ENTRY_CAPACITY = 500;
export const CODE_CAPACITY = 100;
export const codeKey = (project, field, option) => project && field && option ? `${project}|${field}|${option}` : '';
export const allocationTreatment = (label) => /legacy|pending allocation|do not invoice/i.test(label ?? '') ? 'Hold' : 'Review';

export function prepareHandoff(dataset, projectKey) {
  if (dataset.schema_version !== 2) throw new Error('QBO handoff requires a schema_version 2 extract with source milliseconds and Project Code IDs; rerun the live export.');
  const matches = dataset.projects.filter(p=>p.key===projectKey);
  if (matches.length!==1) throw new Error('Select exactly one project key for the QBO handoff.');
  const project=matches[0], ids=new Set(), codes=new Map();
  if (project.entries.length>ENTRY_CAPACITY) throw new Error(`QBO template supports ${ENTRY_CAPACITY} entries; extend template ranges before importing. No entries were truncated.`);
  const addCode=c=>{const key=codeKey(project.name,c.field_id,c.option_id);if(key)codes.set(key,{...c,project:project.name,key,treatment:allocationTreatment(c.label)});};
  for(const c of project.project_codes??[])addCode(c);
  for(const e of project.entries){
    if(!e.time_entry_id || ids.has(e.time_entry_id))throw new Error('Missing or duplicate time-entry ID in QBO handoff.');
    ids.add(e.time_entry_id);
    if(e.duration_valid && !Number.isSafeInteger(e.duration_ms))throw new Error('Exact source duration_ms is required for completed entries.');
    if(e.is_coded)addCode({field_id:e.project_code_field_id,option_id:e.project_code_option_id,label:e.project_code});
  }
  if(codes.size>CODE_CAPACITY)throw new Error(`QBO template supports ${CODE_CAPACITY} Project Codes; extend ranges before importing.`);
  return {project,entries:project.entries,codes:[...codes.values()]};
}

export function localSpreadsheetDate(ms, timeZone){
  if(ms===null || ms===undefined || !Number.isFinite(ms))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).map(p=>[p.type,p.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${String(ms%1000).padStart(3,'0')}Z`);
}

export async function writeQboHandoff(dataset, projectKey, templatePath, outputPath){
  if(path.resolve(templatePath)===path.resolve(outputPath))throw new Error('Keep the blank template unchanged; choose a different handoff output.');
  const data=prepareHandoff(dataset,projectKey);
  const workbook=await SpreadsheetFile.importXlsx(await FileBlob.load(templatePath));
  const review=workbook.worksheets.getItem('Estimate review'),time=workbook.worksheets.getItem('Time entries'),codes=workbook.worksheets.getItem('Project codes'),sow=workbook.worksheets.getItem('SOW register');
  if(time.getRange('N6').values[0][0]!=='Duration ms' || review.getRange('D5').values[0][0]!=='Period end (exclusive)')throw new Error('Use the ClickUp-compatible v2 template.');
  // Always start from blank inputs. Never carry a prior run's billing or status decisions.
  for(const range of ['A7:C506','E7:E506','G7:H506','J7:T506','V7:AB506'])time.getRange(range).clear({applyTo:'contents'});
  sow.getRange('A7:J36').clear({applyTo:'contents'});
  codes.getRange('B7:H106').clear({applyTo:'contents'});
  for(const range of ['B4:B6','E4:E6','H4:H5','G44:G46'])review.getRange(range).clear({applyTo:'contents'});
  review.getRange('B5').values=[[new Date(`${dataset.run.start_date}T00:00:00Z`)]];
  review.getRange('E5').values=[[new Date(`${dataset.run.end_date}T00:00:00Z`)]];
  review.getRange('B6').values=[['ClickUp REST API v2']];
  review.getRange('J4').values=[[dataset.run.time_zone]];review.getRange('J5').values=[[data.project.name]];
  review.getRange('B7').values=[[String(dataset.run.workspace_id??'')]];
  review.getRange('E7').values=[[new Date(dataset.run.generated_at_ms)]];
  data.codes.forEach((c,i)=>codes.getRange(`B${i+7}:H${i+7}`).values=[[c.project,c.field_id,c.option_id,c.label,c.treatment,null,null]]);
  data.entries.forEach((e,i)=>{
    const r=i+7;
    time.getRange(`A${r}:C${r}`).values=[[`TE-${e.time_entry_id}`,e.work_date?new Date(`${e.work_date}T00:00:00Z`):null,e.person]];
    time.getRange(`E${r}`).values=[[e.task_name]];time.getRange(`H${r}`).values=[[e.task_url??'']];
    time.getRange(`J${r}:T${r}`).values=[[e.project,e.task_id,e.parent_task_id??'',e.person_id?`U-${e.person_id}`:'',e.duration_ms,e.duration_status,e.project_code,e.project_code_field_id??'',e.project_code_option_id??'',e.coding_status,e.billable]];
    time.getRange(`V${r}:AA${r}`).values=[[e.description??'',e.task_status??'',localSpreadsheetDate(e.start_ms,dataset.run.time_zone),localSpreadsheetDate(e.end_ms,dataset.run.time_zone),e.start_ms,e.end_ms]];
  });
  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath),{recursive:true});
  await (await SpreadsheetFile.exportXlsx(workbook)).save(outputPath);
  return {output:outputPath,project:data.project.name,entries:data.entries.length,project_codes:data.codes.length,billing_decisions:'Unreviewed',qbo_action:'None'};
}
