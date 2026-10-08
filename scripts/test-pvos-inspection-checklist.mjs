// Real component event handlers against fixture responses, not an authenticated browser test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const app=path.resolve(import.meta.dirname,'../pvos-app'),require=createRequire(path.join(app,'package.json')),ts=require('typescript');
const modules=new Map(),hooks=new Map(),requests=[];
let dirty=true,current,index,view=[],companyId='all',actor='q';
const data={organizationId:'org',loadedAt:'2026-10-08T08:00:00Z',companies:[{id:'company',name:'Company 1'},{id:'other',name:'Company 2'}],members:[{user_id:'q',role:'qppv',email:'qppv@example.invalid'},{user_id:'owner',role:'quality',email:'owner@example.invalid'}],tasks:[{id:'task',company_id:'company',title:'Company task'},{id:'other-task',company_id:'other',title:'Other company task'}],evidence:[{id:'document',task_id:'task',title:'Current document',version:'v1'},{id:'archived',task_id:'task',title:'Archived document',archived_at:'2026-10-07'},{id:'other-document',task_id:'other-task',title:'Other company document'}],literatureRecords:[],handoverEvidence:[],checklistItems:[],checklistLinks:[],checklistReviews:[]};
const clone=x=>JSON.parse(JSON.stringify(x));
const sdk={rpc:async(name,args)=>{requests.push({name,args});if(name==='pvos_start_inspection_checklist')data.checklistItems=[{id:'checkpoint',company_id:'company',area_order:1,area_title:'QPPV',requirement_key:'01.01',title:'Qualifications',revision:1,status:'missing_evidence',effective_status:'missing_evidence',support_count:0,owner_user_id:'owner'}];return {data:null,error:null};}};
const react={useState:initial=>{const state=current,slot=index++;if(!(slot in state))state[slot]=typeof initial==='function'?initial():initial;return [state[slot],value=>{state[slot]=typeof value==='function'?value(state[slot]):value;dirty=true;}];}};
const jsx=(type,props,key)=>({type,props:props||{},key});
function load(file){
 if(modules.has(file))return modules.get(file);
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const exports={};modules.set(file,exports);
 const localRequire=id=>{
  if(id==='react')return react;
  if(id==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
  if(id==='next/link')return {__esModule:true,default:p=>jsx('a',p)};
  if(id.endsWith('_pvos-supabase'))return {pvosSupabase:sdk};
  if(id.endsWith('_components'))return {Badge:p=>jsx('span',p)};
  if(id.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
  const base=path.resolve(path.dirname(file),id);return load(fs.existsSync(base+'.tsx')?base+'.tsx':base+'.ts');
 };
 vm.runInNewContext('(function(require,exports){'+source+'\n})',{console,Intl})(localRequire,exports);return exports;
}
const Page=load(path.join(app,'app/pvos/inspection/_checklist.tsx')).default;
function render(node,location='root',disabled=false){
 if(Array.isArray(node))return node.flatMap((x,i)=>render(x,location+'.'+(x?.key??i),disabled));
 if(node==null||typeof node==='boolean')return [];
 if(typeof node!=='object')return [String(node)];
 if(typeof node.type==='function'){current=hooks.get(location)||[];hooks.set(location,current);index=0;return render(node.type(node.props),location+'.component',disabled);}
 const inherited=disabled||node.type==='fieldset'&&!!node.props.disabled;
 return [{...node,disabled:inherited||node.props.disabled,children:render(node.props.children,location+'.children',inherited)}];
}
async function flush(){if(dirty){dirty=false;view=render(jsx(Page,{data,companyId,userId:actor,onCompany:id=>{companyId=id;hooks.clear();dirty=true;},onRefresh:async()=>{dirty=true;}}));}}
const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'?n:(n.children||[]).map(text).join('');
const all=(nodes=view)=>nodes.flatMap(n=>typeof n==='string'?[]:[n,...all(n.children)]);
const find=(type,label)=>{const found=all().filter(n=>n.type===type&&text(n).trim()===label);assert.equal(found.length,1,`Expected one ${type}: ${label}`);return found[0];};
async function click(label){const n=find('button',label);assert.ok(!n.disabled,'Disabled '+label);await n.props.onClick();await flush();}
async function change(label,value){const n=all().find(n=>n.type==='label'&&text(n).startsWith(label));assert.ok(n,'Missing field '+label);const input=all([n]).find(n=>['select','input','textarea'].includes(n.type));assert.ok(!input.disabled,'Disabled field '+label);input.props.onChange({target:{value}});await flush();}
await flush();assert.ok(text(view).includes('Company inspection checklists'));assert.ok(text(view).includes('Not started'));
const open=all().filter(n=>n.type==='button'&&text(n)==='Open checklist →')[0];await open.props.onClick();await flush();
await click('Start company checklist');assert.equal(requests[0].args.p_company_id,'company');
await click('Qualifications');assert.ok(text(view).includes('Missing evidence'));assert.ok(find('button','Record conclusion').disabled,'No conclusion/evidence cannot record Reviewed');
assert.ok(!text(view).includes('Other company document'));assert.ok(!text(view).includes('Archived document'));
await change('Evidence type','external');await change('Document title','SOP document');await change('HTTPS reference','https://example.invalid/sop');
assert.ok(find('button','Link evidence').disabled,'External version is mandatory');await change('Document version / dated edition','v2');await click('Link evidence');
const link=requests.at(-1);assert.equal(link.name,'pvos_link_inspection_evidence');assert.equal(link.args.p_kind,'external');assert.equal(link.args.p_reference_id,null);assert.equal(link.args.p_version,'v2');assert.equal(link.args.p_revision,1);
await change('Review decision','not_applicable');assert.ok(find('button','Record conclusion').disabled,'Not applicable requires justification');await change('Applicability justification','This company has no clinical trials within this scope');await click('Record conclusion');
const review=requests.at(-1);assert.equal(review.name,'pvos_review_inspection_checkpoint');assert.equal(review.args.p_decision,'not_applicable');assert.equal(review.args.p_conclusion,'This company has no clinical trials within this scope');assert.ok(!('reviewed_by' in review.args),'Client must not supply reviewer identity');
await change('Preparation note','Pending evidence');assert.ok(find('button','Record conclusion').disabled,'Unsaved preparation blocks review');await click('Save preparation');assert.equal(requests.at(-1).name,'pvos_prepare_inspection_checkpoint');
data.checklistItems[0].revision=2;data.checklistItems[0].effective_status='needs_review';data.checklistReviews=[{id:'review',item_id:'checkpoint',item_revision:1,reviewed_at:'2026-10-08T08:00:00Z',reviewer_email:'frozen@example.invalid',reviewer_role:'qppv',decision:'reviewed',conclusion:'Original conclusion',snapshot:{sources:[]}}];dirty=true;await flush();assert.ok(text(view).includes('Needs re-review'));assert.ok(text(view).includes('frozen@example.invalid'));assert.ok(text(view).includes('Original conclusion'));
actor='owner';hooks.clear();dirty=true;await flush();await click('Qualifications');assert.ok(text(view).includes('Prepare evidence'));assert.ok(!all().some(n=>n.type==='button'&&text(n)==='Record conclusion'),'Non-QPPV owner cannot record review');
console.log('PASS: company navigation, initialization, scoped evidence, external version, human conclusion payload, unsaved edits, retained history, re-review warning and preparation/reviewer roles.');
