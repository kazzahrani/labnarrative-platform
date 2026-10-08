// Runs the real Literature components and event handlers against fixture responses.
// This checks client workflow/state; database authorization is tested separately in
// supabase/tests/literature_dual_review.sql. It is not an authenticated browser test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const app=path.resolve(import.meta.dirname,'../pvos-app');
const require=createRequire(path.join(app,'package.json'));
const ts=require('typescript');
let actor='first',dirty=true,view=[],current,index,effects=[];
const hooks=new Map(),modules=new Map(),requests=[];
const clone=x=>JSON.parse(JSON.stringify(x));
const now='2026-10-07T21:00:00Z';
const browserWindow={
  location:{href:'https://pvos.site/pvos/literature',get search(){return new URL(this.href).search;}},
  history:{state:null,replaceState(state,_title,url){this.state=state;browserWindow.location.href=String(url);}},
  confirm:()=>true,addEventListener(){},removeEventListener(){}
};
const members=[{user_id:'first',email:'first@example.invalid'},{user_id:'second',email:'second@example.invalid'}];
const row=(x)=>({organization_id:'org',created_at:now,metadata:{},...x});
const db={
  pvos_companies:[row({id:'company',name:'Fixture company'})],
  pvos_products:[row({id:'product',company_id:'company',brand_name:'Fixture product',active_ingredient:'Ingredient'})],
  pvos_literature_sources:[row({id:'source',name:'Fixture journal',active:true,method:'pubmed',screening_frequency:'daily'})],
  pvos_literature_runs:[row({id:'active',company_id:'company',period_start:'2026-10-01',period_end:'2026-10-07',status:'review',metadata:{automated:true}}),row({id:'parallel',company_id:'company',period_start:'2026-10-01',period_end:'2026-10-07',status:'review'}),row({id:'past',company_id:'company',period_start:'2026-09-01',period_end:'2026-09-30',status:'complete'})],
  pvos_literature_items:[row({id:'a',run_id:'active',product_id:'product',source_id:'source',title:'First safety article',abstract:'Fixture abstract',review_status:'unreviewed',relevance:'likely_relevant'}),row({id:'b',run_id:'active',product_id:'product',source_id:'source',title:'Second article',abstract:'Fixture abstract',review_status:'unreviewed',relevance:'possible'}),...Array.from({length:1003},(_,i)=>row({id:'past-'+i,run_id:'past',title:'Archived article '+i,review_status:'not_relevant'}))],
  pvos_literature_followups:[],pvos_literature_second_reviews:[],pvos_literature_alerts:[],
  pvos_literature_screening_records:[row({id:'past-record',run_id:'past',decision_snapshot:[],metadata:{}})],
  pvos_literature_automation_settings:[row({id:'monitor',cadence_hours:4,last_status:'partial',last_result:{failures:[{source:'Unavailable journal',reason:'Connection failed'}],coverage_gaps:[]}})]
};
let failFollowup=true,failAck=false;
class Query{
  constructor(table){this.table=table;this.filters=[];this.start=0;this.end=Infinity;}
  select(){return this;} order(){return this;}
  eq(k,v){this.filters.push(x=>x[k]===v);return this;}
  in(k,vs){this.filters.push(x=>vs.includes(x[k]));return this;}
  range(a,b){this.start=a;this.end=b;return this;}
  update(value){this.change=value;return this;}
  upsert(value){this.newRow=value;return this;}
  maybeSingle(){this.one=true;return this;} single(){this.one=true;return this;}
  then(resolve,reject){return Promise.resolve().then(()=>{
    requests.push({table:this.table,start:this.start,change:this.change,newRow:this.newRow});
    if(this.newRow&&failFollowup){failFollowup=false;return {data:null,error:{message:'Fixture downstream save failed'}};}
    if(this.table==='pvos_literature_alerts'&&this.change&&failAck){failAck=false;return {data:null,error:{message:'Fixture acknowledgment failed'}};}
    let rows=db[this.table].filter(x=>this.filters.every(f=>f(x))).slice(this.start,this.end+1);
    if(this.change)rows.forEach(x=>Object.assign(x,this.change));
    if(this.newRow){let x=db[this.table].find(x=>x.literature_item_id===this.newRow.literature_item_id&&x.destination===this.newRow.destination);if(x)Object.assign(x,this.newRow);else{ x=row({id:'followup-'+db[this.table].length,...this.newRow});db[this.table].push(x);}rows=[x];}
    return {data:clone(this.one?rows[0]||null:rows),error:null};
  }).then(resolve,reject);}
}
const sdk={from:t=>new Query(t),rpc:async(name,args)=>{
  requests.push({rpc:name,args});
  if(name==='pvos_member_directory')return {data:members,error:null};
  if(name==='pvos_assign_literature_second_review'){
    const sr=row({id:'second-review',run_id:args.p_run_id,assigned_to:args.p_assigned_to,assigned_at:now,status:'pending',metadata:{scope_snapshot:clone(db.pvos_literature_items.filter(x=>x.run_id===args.p_run_id&&x.review_status!=='not_relevant')),summary:{scope_count:1,relevant:1},assignment_cycle:1}});
    db.pvos_literature_second_reviews=[sr];return {data:sr,error:null};
  }
  if(name==='pvos_decide_literature_second_review'){
    Object.assign(db.pvos_literature_second_reviews[0],{status:args.p_decision,reviewed_by:actor,reviewed_at:now,note:args.p_note});return {data:null,error:null};
  }
  if(name==='pvos_complete_literature_screening'){
    db.pvos_literature_runs.find(x=>x.id===args.p_run_id).status='complete';
    db.pvos_literature_screening_records.push(row({id:'new-record',run_id:args.p_run_id,metadata:{second_review:clone(db.pvos_literature_second_reviews[0])},decision_snapshot:clone(db.pvos_literature_items.filter(x=>x.run_id===args.p_run_id))}));return {data:null,error:null};
  }
  throw Error('Unexpected fixture RPC '+name);
}};
const useState=initial=>{const state=current,slot=index++;if(!(slot in state))state[slot]=typeof initial==='function'?initial():initial;return [state[slot],value=>{state[slot]=typeof value==='function'?value(state[slot]):value;dirty=true;}];};
const react={useState,useRef:v=>{const slot=index++;return current[slot]??(current[slot]={current:v});},useMemo:f=>f(),useEffect:(f,deps)=>{const state=current,slot=index++,previous=state[slot];if(!previous||deps?.some((x,i)=>!Object.is(x,previous.deps?.[i]))){state[slot]={deps};effects.push(()=>{previous?.cleanup?.();state[slot].cleanup=f();});}}};
const jsx=(type,props,key)=>({type,props:props||{},key});
function load(file){
  if(modules.has(file))return modules.get(file);
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const exports={};modules.set(file,exports);
  const localRequire=id=>{
    if(id==='react')return react;
    if(id==='next/link')return {__esModule:true,default:p=>jsx('a',p)};
    if(id==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
    if(id.endsWith('_provider'))return {usePVOS:()=>({organizationId:'org',session:{user:{id:actor}}})};
    if(id.endsWith('_pvos-supabase'))return {pvosSupabase:sdk};
    if(id.endsWith('_components'))return {Header:p=>jsx('header',{children:[p.title,p.sub,p.action]}),Badge:p=>jsx('span',p),Help:p=>jsx('span',p),Tabs:p=>jsx('div',{children:p.items.map(item=>jsx('button',{children:item.label,onClick:()=>p.onChange(item.id)}))})};
    if(id.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
    if(id.endsWith('_rank'))return {PRIORITIZATION_VERSION:'fixture'};
    const base=path.resolve(path.dirname(file),id);return load(fs.existsSync(base+'.tsx')?base+'.tsx':base+'.ts');
  };
  vm.runInNewContext('(function(require,exports){'+source+'\n})',{console,Intl,URLSearchParams,window:browserWindow,document:{activeElement:null},Blob,URL})(localRequire,exports);
  return exports;
}
const Page=load(path.join(app,'app/pvos/literature/page.tsx')).default;
function render(node,location='root'){
  if(Array.isArray(node))return node.flatMap((x,i)=>render(x,location+'.'+(x?.key??i)));
  if(node==null||typeof node==='boolean')return [];
  if(node?.props?.hidden)return [];
  if(typeof node!=='object')return [String(node)];
  if(typeof node.type==='function'){
    const state=hooks.get(location)||[];hooks.set(location,state);current=state;index=0;
    return render(node.type(node.props),location+'.component');
  }
  return [{...node,children:render(node.props.children,location+'.children')}];
}
async function flush(){for(let tries=0;tries<20;tries++){if(dirty){dirty=false;view=render(jsx(Page,{}));}const pending=effects;effects=[];pending.forEach(f=>f());await new Promise(resolve=>setImmediate(resolve));if(!dirty&&!effects.length)return;}throw Error('Fixture did not settle');}
const text=node=>Array.isArray(node)?node.map(text).join(''):typeof node==='string'?node:(node.children||[]).map(text).join('');
const all=(nodes=view)=>nodes.flatMap(node=>typeof node==='string'?[]:[node,...all(node.children)]);
const find=(type,label)=>{const matches=all().filter(n=>n.type===type&&text(n).trim()===label);assert.equal(matches.length,1,'Expected one '+type+' '+label);return matches[0];};
async function click(label){const node=find('button',label);assert.ok(!node.props.disabled,'Disabled '+label);await node.props.onClick();await flush();}
const article=()=>all().find(x=>x.type==='article'&&x.props['aria-label']==='Selected article');
await flush();
assert.ok(requests.some(x=>x.table==='pvos_literature_items'&&x.start===1000),'Complete paginated item load');
const choices=all().filter(n=>n.type==='tr'&&text(n).includes('Screening '));
assert.ok(text(choices[0]).includes('Screening ACTIVE · Automatic'));
assert.ok(text(choices[1]).includes('Screening PARALLEL · Manual'),'Same-period runs have different references');
assert.ok(all([choices[0]]).some(n=>n.type==='td'&&text(n)==='2'),'Unresolved count is visible in compact list');
const choice=all([choices[0]]).find(n=>n.type==='button'&&text(n)==='Continue');await choice.props.onClick();await flush();
assert.ok(text(article()).includes('First safety article'));
assert.equal(new URL(browserWindow.location.href).searchParams.get('run'),'active');
hooks.clear();dirty=true;await flush();
assert.ok(text(article()).includes('First safety article'),'Refresh restores the selected screening');
assert.ok(text(view).includes('Screening ACTIVE · Automatic'),'Reader shows the same screening reference');
assert.equal(new URL(browserWindow.location.href).searchParams.get('run'),'active','Initial render must not erase the run link');
await click('Change screening');
assert.equal(new URL(browserWindow.location.href).searchParams.has('run'),false,'Changing screening clears the old link');
await all([all().find(n=>n.type==='tr'&&text(n).includes('Screening ACTIVE'))]).find(n=>n.type==='button'&&text(n)==='Continue').props.onClick();await flush();
await click('Relevant');
let checkbox=all().find(n=>n.type==='input'&&n.props.type==='checkbox');checkbox.props.onChange({target:{checked:true}});await flush();
await click('Save & next');
assert.ok(text(view).includes('Fixture downstream save failed'));
assert.ok(text(article()).includes('First safety article'),'Failure retains the article');
checkbox=all().find(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checkbox.props.checked,true,'Downstream selection survives a failed save');
await click('Save & next');
assert.equal(db.pvos_literature_followups.length,1);
assert.ok(text(article()).includes('Second article'),'Successful save moves to next');
await click('Needs more information');await click('Save & next');
assert.ok(text(view).includes('must be resolved before approval'),'Open information can be routed but cannot complete');
await click('Not relevant');await click('Save & next');
assert.ok(text(view).includes('First screening finished'));
const select=all().find(n=>n.type==='select'&&n.children.some(x=>text(x)==='Choose workspace member'));
assert.ok(!text(select).includes('first@example.invalid'),'First reviewer excluded');select.props.onChange({target:{value:'second'}});await flush();await click('Send for second review');
assert.ok(text(view).includes('Awaiting second@example.invalid'));
assert.equal(all().filter(x=>x.type==='button'&&text(x)==='Complete & create screening record').length,0,'No pending completion action');
actor='second';dirty=true;await flush();await click('Open your second review');
hooks.clear();dirty=true;await flush();
assert.ok(text(view).includes('First-review decisions'),'Refresh restores the second-review workspace');
assert.ok(text(view).includes('first@example.invalid'),'First actor is visible in second review');
const approve=all().find(n=>n.type==='button'&&/Approve second review/.test(text(n)));assert.ok(approve);await approve.props.onClick();await flush();
await click('Complete & create screening record');
assert.ok(text(view).includes('Screening record completed'));await click('Records');
assert.equal(all().filter(x=>x.type==='button'&&text(x)==='Open record').length,2,'Completed records available');
browserWindow.location.href='https://pvos.site/pvos/literature?inspectionRun=past';hooks.clear();dirty=true;await flush();
assert.ok(text(view).includes('Screening PAST · Manual'),'Existing inspection links open the correct record');
assert.ok(text(view).includes('Screening record completed'));
assert.equal(new URL(browserWindow.location.href).searchParams.get('view'),'runs');
await click('Monitoring');assert.ok(text(view).includes('Connection failed'),'Source failure remains visible');

// A failed alert acknowledgment must remain retryable after the decision was saved.
db.pvos_literature_runs.push(row({id:'alert-run',company_id:'company',period_start:'2026-10-07',period_end:'2026-10-07',status:'review'}));
db.pvos_literature_items.push(row({id:'alert-item',run_id:'alert-run',product_id:'product',source_id:'source',title:'Exact alerted article',review_status:'unreviewed',metadata:{urgent_saudi:true}}));
db.pvos_literature_alerts.push(row({id:'alert',literature_item_id:'alert-item',status:'open',severity:'high'}));
browserWindow.location.href='https://pvos.site/pvos/literature';hooks.clear();dirty=true;await flush();await click('Alerts (1)');
const open=all().find(n=>n.type==='button'&&/Open in queue/.test(text(n)));assert.ok(open);await open.props.onClick();await flush();
assert.ok(text(article()).includes('Exact alerted article'));assert.equal(all().filter(x=>x.type==='button'&&x.props['aria-pressed']!==undefined&&text(x).includes('First safety article')).length,0);
hooks.clear();dirty=true;await flush();assert.ok(text(article()).includes('Exact alerted article'),'Refresh retains exact alert context');
failAck=true;await click('Not relevant');await click('Save & next');
assert.ok(text(view).includes('Fixture acknowledgment failed'));assert.ok(text(article()).includes('Exact alerted article'));assert.equal(db.pvos_literature_alerts[0].status,'open');
await click('Save & next');assert.equal(db.pvos_literature_alerts[0].status,'acknowledged');assert.equal(article(),undefined);
console.log('PASS: distinct run references, run and exact-alert refresh restoration, changing screening, pagination, reader decisions, retained downstream choice/retry, next article, unresolved information, independent assignment UI, pending completion block, approval/completion rendering, records, source failure, exact alert and acknowledgment retry. Fixture UI logic only; no browser/auth/database security claims.');
