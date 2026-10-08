// Actual components and event handlers with fixture responses. Backend enforcement
// is separately exercised by rollback SQL; this is not an authenticated browser test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const app=path.resolve(import.meta.dirname,'../pvos-app'),require=createRequire(path.join(app,'package.json')),ts=require('typescript');
const modules=new Map(),hooks=new Map(),requests=[];
let actor='owner',dirty=true,current,index,view=[],effects=[];
const clone=x=>JSON.parse(JSON.stringify(x)),now='2026-10-08T08:00:00Z';
const window={location:{href:'https://pvos.site/pvos/signal?view=authority',get search(){return new URL(this.href).search;}},history:{state:null,replaceState(state,_title,url){this.state=state;window.location.href=String(url);}}};
const members=[{user_id:'owner',email:'owner@example.invalid',role:'admin'},{user_id:'reviewer',email:'reviewer@example.invalid',role:'deputy_qppv'},{user_id:'replacement',email:'replacement@example.invalid',role:'qppv'}];
const row=x=>({organization_id:'org',created_at:now,...x});
const source=row({id:'source',name:'Fixture authority',method:'manual',url:'https://example.invalid/authority',coverage_note:'Manual archive check required.'});
const product=row({id:'product',company_id:'company',brand_name:'Fixture medicine',active_ingredient:'metformin',updated_at:'2026-09-01T00:00:00Z'});
const period=row({id:'period-12345678',company_id:'company',revision:1,status:'draft',period_start:'2026-09-01',period_end:'2026-09-30',due_at:'2026-09-30T21:00:00Z',owner_user_id:'owner',reviewer_user_id:'reviewer',task_id:'task',settings_snapshot:{company_name:'Fixture company',owner_email:members[0].email,reviewer_email:members[1].email,sop_reference:'PV-SOP v2',form_reference:'Authority form v3'},product_snapshot:[product]});
const check=row({id:'check',period_id:period.id,company_id:'company',source_id:source.id,source_snapshot:source,outcome:'not_checked'});
const db={pvos_companies:[row({id:'company',name:'Fixture company'})],pvos_products:[product],pvos_authority_sources:[source],pvos_authority_settings:[],pvos_authority_periods:[period],pvos_authority_checks:[check],pvos_authority_findings:[],pvos_authority_reviews:[],pvos_authority_records:[],pvos_authority_notices:Array.from({length:1003},(_,i)=>row({id:'old-'+i,source_id:'other-source',url:'https://example.invalid/'+i,title:'Old baseline',published_at:'2024-01-01',first_seen_at:now,baseline:true})),pvos_authority_collection_runs:[],pvos_signal_reviews:[],pvos_literature_items:[],pvos_literature_followups:[]};
class Query{
 constructor(table){this.table=table;this.filters=[];this.start=0;this.end=Infinity;}
 select(){return this;}order(){return this;}
 eq(k,v){this.filters.push(x=>k==='pvos_companies.organization_id'?x.organization_id===v:x[k]===v);return this;}
 range(a,b){this.start=a;this.end=b;return this;}
 single(){this.one=true;return this;}is(k,v){this.filters.push(x=>(x[k]??null)===v);return this;}or(){return this;}limit(){return this;}
 then(resolve,reject){return Promise.resolve().then(()=>{requests.push({table:this.table,start:this.start});assert.ok(db[this.table],'Unexpected table '+this.table);const rows=db[this.table].filter(x=>this.filters.every(f=>f(x))).slice(this.start,this.end+1);return {data:clone(this.one?rows[0]||null:rows),error:null};}).then(resolve,reject);}
}
const sdk={from:t=>new Query(t),rpc:async(name,args)=>{
 requests.push({name,args});
 if(name==='pvos_member_directory')return {data:clone(members),error:null};
 if(name==='pvos_record_authority_finding'){
  db.pvos_authority_findings=[row({id:'finding',period_id:period.id,check_id:check.id,company_id:'company',notice_id:null,title:args.p_title,url:args.p_url,product_ids:args.p_product_ids,assessment:args.p_assessment,rationale:args.p_rationale})];check.outcome='not_checked';check.checked_at=null;period.revision++;
 }else if(name==='pvos_record_authority_check'){
  Object.assign(check,{outcome:args.p_outcome,notes:args.p_notes,checked_at:now,checked_email:members.find(m=>m.user_id===actor).email,checked_by:actor});period.revision++;
 }else if(name==='pvos_escalate_authority_finding'){
  const f=db.pvos_authority_findings[0];db.pvos_signal_reviews=[row({id:'signal',authority_finding_id:f.id,literature_item_id:null,company_id:'company',product_id:'product',status:'new',assessment:'unassessed',metadata:{title:f.title,url:f.url,authority_name:source.name,finding_snapshot:clone(f),product_snapshot:[clone(product)]}})];period.revision++;
 }else if(name==='pvos_submit_authority_period'){
  db.pvos_authority_reviews.push(row({id:'review-'+(db.pvos_authority_reviews.length+1),period_id:period.id,cycle:db.pvos_authority_reviews.length+1,status:'pending',sent_by:actor,sent_email:members.find(m=>m.user_id===actor).email,sent_at:now,assigned_to:period.reviewer_user_id,assigned_email:period.settings_snapshot.reviewer_email,submission_note:args.p_note,snapshot:{period:clone(period),checks:[clone(check)],findings:clone(db.pvos_authority_findings),products_at_submission:[clone(product)]}}));period.status='pending_review';period.revision++;
 }else if(name==='pvos_decide_authority_review'){
  const r=db.pvos_authority_reviews.find(r=>r.id===args.p_review_id);Object.assign(r,{status:args.p_decision,decided_by:actor,decided_email:members.find(m=>m.user_id===actor).email,decided_role:'qppv',decided_at:now,decision_note:args.p_reason});period.status=args.p_decision==='approved'?'approved':'returned';period.revision++;
  if(period.status==='approved')db.pvos_authority_records=[row({id:'record',period_id:period.id,company_id:'company',completed_at:now,snapshot_sha256:'fixture-sha',snapshot:{first_review:{email:r.sent_email,submitted_at:r.sent_at},second_review:{email:r.decided_email,decided_at:r.decided_at},submitted_evidence:clone(r.snapshot)}})];
 }else if(name==='pvos_change_authority_reviewer'){
  period.reviewer_user_id=args.p_reviewer_id;period.settings_snapshot.reviewer_email=members.find(m=>m.user_id===args.p_reviewer_id).email;period.revision++;
 }else if(name==='pvos_assess_authority_signal'){
  Object.assign(db.pvos_signal_reviews[0],{assessment:args.p_assessment,status:args.p_status,notes:args.p_notes});
 }else throw Error('Unexpected RPC '+name);
 return {data:null,error:null};
}};
const useState=initial=>{const state=current,slot=index++;if(!(slot in state))state[slot]=typeof initial==='function'?initial():initial;return [state[slot],value=>{state[slot]=typeof value==='function'?value(state[slot]):value;dirty=true;}];};
function memo(f,deps){const state=current,slot=index++,old=state[slot];if(!old||deps?.some((d,i)=>!Object.is(d,old.deps?.[i])))state[slot]={deps,value:f()};return state[slot].value;}
const react={useState,useRef:v=>{const slot=index++;return current[slot]??(current[slot]={current:v});},useMemo:memo,useCallback:(f,deps)=>memo(()=>f,deps),useEffect:(f,deps)=>{const state=current,slot=index++,old=state[slot];if(!old||deps?.some((d,i)=>!Object.is(d,old.deps?.[i]))){state[slot]={deps};effects.push(()=>{old?.cleanup?.();state[slot].cleanup=f();});}}};
const jsx=(type,props,key)=>({type,props:props||{},key});
function load(file){
 if(modules.has(file))return modules.get(file);
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const exports={};modules.set(file,exports);
 const localRequire=id=>{
  if(id==='react')return react;if(id==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
  if(id==='next/link')return {__esModule:true,default:p=>jsx('a',p)};
  if(id==='next/navigation')return {useParams:()=>({id:'task'})};
  if(id.endsWith('_task-review'))return {TaskReviewPanel:()=>jsx('p',{children:'Generic task review panel'})};
  if(id.endsWith('_provider'))return {usePVOS:()=>({organizationId:'org',session:{user:{id:actor}}})};
  if(id.endsWith('_pvos-supabase'))return {pvosSupabase:sdk};
  if(id.endsWith('_components'))return {Header:p=>jsx('header',{children:[p.title,p.sub,p.action]}),Badge:p=>jsx('span',p),Help:p=>jsx('span',p),Tabs:p=>jsx('div',{children:p.items.map(item=>jsx('button',{children:item.label,onClick:()=>p.onChange(item.id)}))}),statusTone:()=> 'default'};
  if(id.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
  const base=path.resolve(path.dirname(file),id);return load(fs.existsSync(base+'.tsx')?base+'.tsx':base+'.ts');
 };
 vm.runInNewContext('(function(require,exports){'+source+'\n})',{console,Intl,URL,URLSearchParams,window,Blob})(localRequire,exports);return exports;
}
let Page=load(path.join(app,'app/pvos/signal/page.tsx')).default;
function render(node,location='root',disabled=false){
 if(Array.isArray(node))return node.flatMap((x,i)=>render(x,location+'.'+(x?.key??i),disabled));
 if(node==null||typeof node==='boolean')return [];
  if(node?.props?.hidden)return [];if(typeof node!=='object')return [String(node)];
 if(typeof node.type==='function'){const key=location+':'+(node.key??'');current=hooks.get(key)||[];hooks.set(key,current);index=0;return render(node.type(node.props),key+'.component',disabled);}
 const inherited=disabled||node.type==='fieldset'&&!!node.props.disabled;
 return [{...node,disabled:inherited||node.props.disabled,children:render(node.props.children,location+'.children',inherited)}];
}
async function flush(){for(let n=0;n<30;n++){if(dirty){dirty=false;view=render(jsx(Page,{}));}const pending=effects;effects=[];pending.forEach(f=>f());await new Promise(r=>setImmediate(r));if(!dirty&&!effects.length)return;}throw Error('Fixture did not settle');}
const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'?n:(n.children||[]).map(text).join('');
const all=(nodes=view)=>nodes.flatMap(n=>typeof n==='string'?[]:[n,...all(n.children)]);
const find=(type,label)=>{const found=all().filter(n=>n.type===type&&text(n).trim()===label);assert.equal(found.length,1,`Expected one ${type}: ${label}`);return found[0];};
async function click(label){const n=find('button',label);assert.ok(!n.disabled,'Disabled '+label);await n.props.onClick();await flush();}
async function change(label,value){const n=all().find(n=>n.type==='label'&&text(n).trim().startsWith(label));assert.ok(n,'Missing field '+label);const input=all([n]).find(n=>['select','input','textarea'].includes(n.type));assert.ok(!input.disabled,'Disabled '+label);input.props.onChange({target:{value,checked:value===true}});await flush();}
async function login(id){actor=id;hooks.clear();dirty=true;await flush();}
await flush();assert.ok(text(view).includes('Outstanding monitoring periods'));assert.ok(requests.some(r=>r.table==='pvos_authority_notices'&&r.start===1000),'Notices paginated');
await click('Open period →');assert.equal(new URL(window.location.href).searchParams.get('authorityPeriod'),period.id);assert.ok(text(view).includes('Monitoring PERIOD-1'));assert.ok(find('button','Send to reviewer@example.invalid').disabled);
await click('Open source');await click('Add finding from manual check');
await change('Finding title','Fixture safety notice');await change('HTTPS evidence URL','https://example.invalid/notice');await change('Human relevance assessment','relevant');await change('Assessment rationale','Potential safety relevance for the company product.');
assert.ok(find('button','Save finding').disabled,'Relevant finding needs a company product');await change('Fixture medicine',true);await click('Save finding');
assert.equal(requests.filter(r=>r.name==='pvos_record_authority_finding').at(-1).args.p_assessment,'relevant');assert.ok(!('created_by' in requests.filter(r=>r.name==='pvos_record_authority_finding').at(-1).args));
await click('Send to Signal Review');assert.equal(db.pvos_signal_reviews[0].assessment,'unassessed');assert.equal(db.pvos_signal_reviews[0].literature_item_id,null);
await change('Outcome','unavailable');await change('Scope, period, evidence','Unable to access source; follow-up required.');await click('Record source check');assert.ok(find('button','Send to reviewer@example.invalid').disabled,'Unavailable source blocks submission');
await change('Outcome','findings');await change('Scope, period, evidence','September source archive reviewed; relevant finding documented.');await click('Record source check');await change('Monitoring conclusion','Required source checked; finding escalated for QPPV signal assessment.');await click('Send to reviewer@example.invalid');
assert.ok(text(view).includes('Waiting for the named reviewer: reviewer@example.invalid.'));assert.ok(!all().some(n=>n.type==='button'&&text(n)==='Approve monitoring record'),'Owner cannot approve');
await login('reviewer');assert.ok(text(view).includes('Fixture safety notice'));assert.ok(!all().some(n=>n.type==='button'&&text(n)==='Add finding from manual check'),'Reviewer cannot prepare own evidence');assert.ok(find('button','Return to owner').disabled,'Return requires a reason');
await change('Reviewer conclusion / return reason','Please clarify the archive scope.');await click('Return to owner');assert.equal(db.pvos_authority_reviews[0].status,'returned');
await login('owner');await change('Named QPPV reviewer','replacement');await change('Change reason','Original reviewer unavailable for re-submission.');await click('Change named reviewer');assert.equal(db.pvos_authority_reviews[0].assigned_email,'reviewer@example.invalid','Original recipient retained');
await change('Monitoring conclusion','Archive scope clarified, including the September archive.');await click('Send to replacement@example.invalid');
await login('reviewer');assert.ok(!all().some(n=>n.type==='button'&&text(n)==='Approve monitoring record'),'Previous reviewer cannot approve replacement submission');
await login('replacement');await change('Reviewer conclusion / return reason','Source scope, product assessment and escalation reviewed.');await click('Approve monitoring record');
assert.ok(text(view).includes('Approved evidence retained'));assert.ok(text(view).includes('owner@example.invalid'));assert.ok(text(view).includes('replacement@example.invalid'));assert.ok(find('button','Export approved record JSON'));
await click('← Back to monitoring periods');await click('Records');assert.ok(text(view).includes('Approved monitoring records'));await click('Open record →');assert.ok(!all().some(n=>n.type==='button'&&text(n)==='Record source check'),'Approved record is read only');
await click('Signal Review');await click('Open');assert.ok(text(view).includes('Human escalation'));assert.ok(text(view).includes('Recorded finding rationale'));assert.ok(!text(view).includes('No flag detected'),'No invented Saudi classification');assert.ok(find('button','Mark potential signal').disabled,'Authority signal needs rationale');
await change('QPPV assessment notes','Potential signal requires further assessment; retain under review.');await click('Mark potential signal');
const assessment=requests.filter(r=>r.name==='pvos_assess_authority_signal').at(-1);assert.equal(assessment.args.p_status,'under_review');assert.equal(assessment.args.p_review_id,'signal');assert.ok(!('reviewer_user_id' in assessment.args),'Database records assessment actor');
db.pvos_tasks=[row({id:'task',company_id:'company',activity_type:'authority_monitoring',status:'complete',priority:'normal',source:'system',title:'Monthly monitoring',owner_user_id:'owner',due_at:period.due_at,metadata:{authority_period_id:period.id}})];
db.pvos_task_evidence=[];db.pvos_task_approvals=[];db.pvos_audit_events=[];
Page=load(path.join(app,'app/pvos/tasks/[id]/page.tsx')).default;hooks.clear();dirty=true;await flush();
assert.equal(find('a','Open authority monitoring →').props.href,`/pvos/signal?view=authority&authorityPeriod=${period.id}`);
for(const label of ['Mark complete','Reopen','Send for review'])assert.ok(!all().some(n=>n.type==='button'&&text(n)===label),'No generic '+label+' action on linked monitoring task');
assert.ok(!text(view).includes('Generic task review panel'),'Linked tasks use the independent monitoring workflow');
await click('Evidence (0)');
assert.ok(all().find(n=>n.type==='input'&&n.props.placeholder==='Evidence note').disabled,'Approved evidence stays read only');
console.log('PASS: real component navigation, pagination, named routing, source gaps, relevance/product checks, explicit Signal escalation, independent Return/Approve, replacement history, approved records and authority Signal assessment payload.');
