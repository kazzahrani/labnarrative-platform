import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
const require=createRequire(import.meta.url),ts=require('../pvos-app/node_modules/typescript');
const cache=new Map();
function readModule(path){
  if(cache.has(path))return cache.get(path);
  const module={exports:{}};cache.set(path,module.exports);
  const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',source)(name=>readModule(resolve(dirname(path),name+'.ts')),module,module.exports);
  cache.set(path,module.exports);return module.exports;
}
const {scopeInspection,inspectionApprovals,inspectionChecks,inspectionExport,csvCell,loadInspection,loadInspectionAudit}=readModule(resolve('pvos-app/app/pvos/_inspection.ts'));
const data={organizationId:'org',loadedAt:'2026-10-07T19:00:00Z',companies:[{id:'c1',name:'Company 1'},{id:'c2',name:'Company 2'}],
  tasks:[{id:'t1',company_id:'c1',title:'RMP',status:'complete'},{id:'t2',company_id:'c2',title:'Other company task',status:'complete'},{id:'t3',company_id:'c1',status:'cancelled',due_at:'2020-01-01'}],
  evidence:[{id:'e1',task_id:'t1',title:'Old evidence',archived_at:'2026-10-01'},{id:'e2',task_id:'t2'}],
  products:[{id:'p1',company_id:'c1',brand_name:'Product 1',registration_status:'Registered'},{id:'p2',company_id:'c2',brand_name:'Product 2'}],
  runs:[{id:'r1',company_id:'c1',status:'complete'},{id:'r2',company_id:'c2',status:'review'}],
  secondReviews:[{id:'sr1',run_id:'r1',status:'approved'},{id:'sr2',run_id:'r2',status:'pending'}],
  literatureRecords:[{id:'lr1',run_id:'r1',company_id:'c1',metadata:{first_reviewer_user_ids:['q'],second_review:{status:'approved',reviewed_by:'d',reviewed_at:'2026-10-07T18:00:00Z',metadata:{scope_item_ids:['i1'],history:[{status:'returned',note:'Needs review unresolved',reviewed_by:'d'}]}}},decision_snapshot:[{literature_item_id:'i1',title:'Selected safety article',review_status:'relevant',reviewer_user_id:'q',reviewed_at:'2026-10-07T17:00:00Z',decision_note:'=HYPERLINK("bad")',followups:[{destination:'psur_evidence'}]},{literature_item_id:'i2',title:'Obvious irrelevant article',review_status:'not_relevant',reviewer_user_id:'q'}]}],
  handovers:[{id:'h1',workflow_version:2,status:'closed',qppv_user_id:'q',deputy_user_id:'d'}],handoverCompanies:[{id:'hc1',handover_id:'h1',company_id:'c1',deputy_acknowledged_by:'d',qppv_handback_acknowledged_by:'q'},{id:'hc2',handover_id:'h1',company_id:'c2'}],
  handoverEvidence:[{id:'he1',handover_id:'h1',snapshot_sha256:'original-hash',snapshot:{companies:[{company_id:'c1',snapshot:{tasks:[{id:'t1'}]}},{company_id:'c2',snapshot:{tasks:[{id:'t2'}]}}]}}],
  approvals:[{id:'a1',task_id:'t1',route_id:'route1',step_position:1,status:'approved',assigned_user_id:'q',completed_at:'2026-10-01'},{id:'a2',task_id:'t1',route_id:'route1',step_position:2,status:'approved',completed_by:'q',completed_by_email:'frozen@example.invalid',completed_at:'2026-10-07',decision_context:{step_role:'Quality',acting_workspace_role:'admin',destination:'task_complete'}},{id:'a3',task_id:'t2',status:'in_review'}],
  steps:[{id:'s1',route_id:'route1',position:1,role:'QPPV'}],members:[{user_id:'q',email:'current@example.invalid',role:'admin'},{user_id:'d',email:'deputy@example.invalid',role:'deputy_qppv'}],
  audit:[{id:1,entity_type:'approval',entity_id:'a1',event_type:'insert',actor_user_id:'q',after_data:{status:'approved'}},{id:2,entity_type:'product_registration',entity_id:'p1',company_id:'c1',actor_user_id:'q',metadata:{actor_email:'frozen@example.invalid',reason:'TESTING'},before_data:{registration_reference:null},after_data:{registration_reference:'Demo workflow test'}},{id:3,entity_type:'handover_evidence',entity_id:'he1',company_id:null,metadata:{handover_id:'h1'}},{id:4,entity_type:'task',entity_id:'t2',company_id:'c2'}]};
const scoped=scopeInspection(data,'c1');
assert.deepEqual(scoped.tasks.map(t=>t.id),['t1','t3']);assert.deepEqual(scoped.evidence.map(e=>e.id),['e1']);assert.deepEqual(scoped.audit.map(a=>a.id),[1,2,3]);
assert.equal(scoped.handoverCompanies.length,1);assert.strictEqual(scoped.handoverEvidence[0],data.handoverEvidence[0],'original shared snapshot must not be projected or rehashed');
assert.equal(inspectionApprovals(scoped)[0].actor.recorded,false,'seeded assignment must not become a decision identity');
assert.equal(inspectionApprovals(scoped)[1].actor.name,'frozen@example.invalid');
assert.equal(inspectionChecks(scoped).missingTaskEvidence,1,'archived evidence must not satisfy current task evidence check');
assert.equal(inspectionChecks(scoped).overdueTasks,0,'cancelled tasks are not overdue');
assert.equal(inspectionChecks(scoped).unattributedApprovals,1);assert.equal(inspectionChecks(scoped).missingRegistrationNumber,1);
const out=inspectionExport(scoped,'c1','2026-10-07T19:00:00Z');
assert.equal(out.json.records.tasks.length,2);assert.equal(out.json.records.handoverEvidence[0].snapshot_sha256,'original-hash');
assert.match(out.csv,/Needs review unresolved/);assert.match(out.csv,/TESTING/);assert.match(out.csv,/Deputy|deputy/);assert.match(out.csv,/Approver not recorded/);assert.match(out.csv,/psur_evidence/);
assert.ok(!out.csv.includes('Other company task'));
const outside=out.csv.split('\n').find(line=>line.includes('Obvious irrelevant article'));
assert.ok(outside.includes('Outside recorded scope'));assert.ok(!outside.includes('"d"'),'article outside second-review scope must not inherit reviewer decision');
assert.equal(csvCell('=SUM(1,2)'),`"'=SUM(1,2)"`);assert.equal(csvCell('  @SUM(1)'),`"'  @SUM(1)"`);assert.equal(csvCell('normal "note"'),`"normal ""note"""`);
assert.equal(out.json.records.literatureRecords[0].decision_snapshot[0].decision_note,'=HYPERLINK("bad")','JSON must retain exact text');

// Use the real loader with a query-builder test double: verify all pages and workspace filters.
const tables={pvos_companies:data.companies,pvos_tasks:Array.from({length:2317},(_,i)=>({id:'task-'+i,company_id:'c1'})),pvos_task_evidence:data.evidence,pvos_literature_screening_records:data.literatureRecords,pvos_literature_runs:data.runs,pvos_literature_second_reviews:data.secondReviews,pvos_handovers:data.handovers,pvos_handover_companies:data.handoverCompanies,pvos_handover_evidence:data.handoverEvidence,pvos_products:data.products,pvos_task_approvals:data.approvals,pvos_audit_events:Array.from({length:2507},(_,i)=>({id:i,created_at:'2026-10-07',entity_type:'task',before_data:{title:'raw event data'},after_data:{title:'changed'}})),pvos_approval_steps:data.steps};
tables.pvos_task_reviews=[];
const requests=[];
function client(failedTable){return {rpc:async()=>({data:data.members,error:null}),from(table){const query={filters:[],from:0,to:999,columns:'*',inFilters:[]};const builder={select(columns){query.columns=columns;return this;},eq(field,value){query.filters.push([field,value]);return this;},order(){return this;},in(field,value){query.filters.push([field,value]);query.inFilters.push([field,value]);return this;},range(from,to){query.from=from;query.to=to;return this;},then(resolve,reject){requests.push({table,...query});let rows=tables[table].filter(row=>query.inFilters.every(([field,values])=>values.includes(row[field]))).slice(query.from,query.to+1);if(!query.columns.includes('*'))rows=rows.map(row=>Object.fromEntries(query.columns.split(',').map(field=>[field,row[field]])));return Promise.resolve({data:rows,error:table===failedTable?{message:'permission denied'}:null}).then(resolve,reject);}};return builder;}};}
const loaded=await loadInspection(client(),'org');assert.equal(loaded.tasks.length,2317);assert.equal(loaded.audit.length,2507);
assert.equal(loaded.audit[0].before_data,undefined,'opening Inspection must not pull every audit payload');
const completeAudit=await loadInspectionAudit(client(),'org');assert.equal(completeAudit.length,2507);assert.equal(completeAudit[0].before_data.title,'raw event data','export must retrieve the full original audit payload');
for(const r of requests.filter(r=>r.table!=='pvos_approval_steps'))assert.ok(r.filters.some(([field,value])=>field.endsWith('organization_id')&&value==='org'),r.table+' must be explicitly workspace scoped');
await assert.rejects(loadInspection(client('pvos_handover_evidence'),'org'),/permission denied/);
await assert.rejects(loadInspectionAudit(client('pvos_audit_events'),'org'),/permission denied/);
console.log('PASS: company scope, intact shared snapshots, truthful approval actors, second-review article scope, return history, archived evidence, safe CSV/exact JSON, full pagination, workspace filters and read failures.');
