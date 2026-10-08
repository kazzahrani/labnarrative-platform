// Exercise the real inbox queries, assignment rules and navigation with fixture data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const app=path.resolve(import.meta.dirname,'../pvos-app');
const require=createRequire(path.join(app,'package.json')),ts=require('typescript');
const row=x=>({organization_id:'org',...x});
const task=x=>row({company_id:'company',title:'Fixture task',activity_type:'Training',status:'in_progress',owner_user_id:'owner',due_at:'2026-10-07T21:00:00Z',...x});
const db={
 pvos_tasks:[...Array.from({length:1001},(_,i)=>task({id:'task-'+i})),task({id:'lit',activity_type:'Literature'}),task({id:'rmp',activity_type:'RMP',product_id:'product'}),task({id:'authority',activity_type:'authority_monitoring',metadata:{authority_period_id:'period'}})],
 pvos_companies:[row({id:'company',name:'Fixture company',qppv_user_id:'owner'})],
 pvos_literature_runs:[row({id:'routine',company_id:'company',period_start:'2026-10-01',period_end:'2026-10-07',started_by:'owner',metadata:{automated:true}}),row({id:'historical',company_id:'company',period_start:'2020-01-01',period_end:'2020-02-01'}),row({id:'done',company_id:'company',status:'complete'})],
 pvos_literature_items:[row({id:'decision',run_id:'routine',review_status:'needs_review'})],
 pvos_literature_screening_records:[row({id:'record',run_id:'done'})],
 pvos_literature_second_reviews:[row({id:'second',run_id:'routine',status:'pending',assigned_to:'reviewer'})],
 pvos_task_reviews:[row({id:'named',company_id:'company',task_id:'task-0',status:'pending',assigned_to:'reviewer'})],
 pvos_task_approvals:[{id:'route-review',task_id:'task-1',route_id:'route',step_position:1,status:'in_review',assigned_user_id:'reviewer',pvos_tasks:task({id:'task-1'})},{id:'role-review',task_id:'task-2',route_id:'route',step_position:2,status:'in_review',assigned_user_id:null,pvos_tasks:task({id:'task-2'})}],
 pvos_approval_steps:[{id:'step-1',route_id:'route',position:1,role:'qppv'},{id:'step-2',route_id:'route',position:2,role:'Quality'}],
 pvos_handovers:[row({id:'leave',qppv_user_id:'owner',deputy_user_id:'reviewer',status:'sent'})],
 pvos_handover_companies:[{id:'leave-company',handover_id:'leave',company_id:'company',deputy_acknowledged_at:null}],
 pvos_authority_periods:[row({id:'period',company_id:'company',period_start:'2026-10-01',period_end:'2026-10-31',due_at:'2026-11-01T00:00:00Z'})],
 pvos_authority_reviews:[row({id:'authority-review',period_id:'period',company_id:'company',status:'pending',assigned_to:'reviewer'})]
};
const members=[{user_id:'owner',role:'qppv',email:'owner@example.invalid'},{user_id:'reviewer',role:'reviewer',email:'reviewer@example.invalid'},{user_id:'quality',role:'quality',email:'quality@example.invalid'}];
const requests=[];
class Query{
 constructor(table){this.table=table;this.filters=[];this.start=0;this.end=Infinity;}
 select(){return this;} order(){return this;}
 eq(key,value){this.filters.push(r=>key.split('.').reduce((x,k)=>x?.[k],r)===value);return this;}
 in(key,values){this.filters.push(r=>values.includes(r[key]));return this;}
 range(a,b){this.start=a;this.end=b;return this;}
 then(resolve,reject){requests.push({table:this.table,start:this.start});return Promise.resolve({data:(db[this.table]||[]).filter(r=>this.filters.every(f=>f(r))).slice(this.start,this.end+1),error:null}).then(resolve,reject);}
}
const client={from:t=>new Query(t),rpc:async()=>({data:members,error:null})},modules=new Map();
function load(file){
 if(modules.has(file))return modules.get(file);
 const exports={};modules.set(file,exports);
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const localRequire=id=>id.endsWith('_pvos-supabase')?{pvosSupabase:client}:load(path.resolve(path.dirname(file),id+'.ts'));
 vm.runInNewContext('(function(require,exports){'+source+'\n})',{Date,Intl,URLSearchParams})(localRequire,exports);return exports;
}
const utils=load(path.join(app,'app/pvos/_work-utils.ts')),{readWork}=load(path.join(app,'app/pvos/_work.ts'));
const noon=new Date('2026-10-08T12:00:00Z');
assert.equal(utils.deadlineState('2026-10-06','in_progress',noon).label,'2 days overdue');
assert.equal(utils.deadlineState('2026-10-06','complete',noon).label,'');
assert.equal(utils.deadlineState('2026-10-08T21:30:00Z','in_progress',noon).days,1,'Deadline uses Riyadh date');
assert.equal(utils.deadlineState('invalid','in_progress',noon).label,'');
assert.equal(utils.isHistoricalRun({period_end:'2020-02-01',metadata:{automated:true}},noon),false,'Routine automatic runs stay visible');
assert.equal(utils.isHistoricalRun({period_end:'2020-02-01'},noon),true);
const data=await readWork('org','reviewer');
assert.equal(data.tasks.length,1004,'Every task page is read');
assert.ok(requests.some(r=>r.table==='pvos_tasks'&&r.start===1000));
assert.deepEqual(Array.from(data.items.filter(i=>i.review).map(i=>i.id)).sort(),['approval:route-review','authority-review:authority-review','handover:leave-company','review:named','screening:routine'].sort(),'Only assigned actionable reviews enter the inbox');
assert.ok(!data.items.some(i=>i.id==='screening:historical'));
const lit=data.items.find(i=>i.id==='task:lit'),url=new URL(lit.href,'https://example.invalid');
assert.equal(url.pathname,'/pvos/literature');assert.equal(url.searchParams.get('company'),'company');assert.equal(url.searchParams.get('task'),'lit');assert.ok(!url.searchParams.has('run'),'An unrelated screening must not be inferred');
assert.ok(data.items.find(i=>i.id==='task:rmp').href.includes('product=product'));
assert.ok(data.items.find(i=>i.id==='task:authority').href.includes('authorityPeriod=period'));
assert.ok(data.items.find(i=>i.id==='record:done').href.includes('inspectionRun=done'));
const quality=await readWork('org','quality');
assert.deepEqual(Array.from(quality.items.filter(i=>i.review).map(i=>i.id)),['approval:role-review'],'Role-based staged approval eligibility is preserved');
assert.equal(data.items.find(i=>i.id==='task:task-0').status,'in_progress','Overdue timing never replaces workflow status');
console.log('PASS: weekly inbox assignments, pagination, Riyadh deadlines and contextual links');
