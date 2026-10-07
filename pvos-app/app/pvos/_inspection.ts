import { readApprovalRows, decisionAttribution, approvalOutcome, type Member } from "./_approval";

type Row=Record<string,any>;
export type InspectionData={organizationId:string,loadedAt:string,auditLoadedAt?:string,companies:Row[],tasks:Row[],evidence:Row[],literatureRecords:Row[],runs:Row[],secondReviews:Row[],handovers:Row[],handoverCompanies:Row[],handoverEvidence:Row[],products:Row[],approvals:Row[],steps:Row[],audit:Row[],members:Member[]};

export async function loadInspectionAudit(client:any,organizationId:string){
  return readApprovalRows<Row>((from,to)=>client.from("pvos_audit_events").select("*").eq("organization_id",organizationId).order("id").range(from,to));
}

// Every collection is scoped to the signed-in workspace and read to its final page.
// Export is a fetched view; only the original evidence records are frozen snapshots.
export async function loadInspection(client:any,organizationId:string):Promise<InspectionData>{
  const direct=(table:string)=>readApprovalRows<Row>((from,to)=>client.from(table).select("*").eq("organization_id",organizationId).order("id").range(from,to));
  const joined=(table:string,relation:string)=>readApprovalRows<Row>((from,to)=>client.from(table).select(`*,${relation}!inner(organization_id)`).eq(`${relation}.organization_id`,organizationId).order("id").range(from,to));
  const [companies,tasks,evidence,literatureRecords,runs,secondReviews,handovers,handoverCompanies,handoverEvidence,products,approvals,auditRows,decisionEvents,directory]=await Promise.all([
    direct("pvos_companies"),direct("pvos_tasks"),joined("pvos_task_evidence","pvos_tasks"),direct("pvos_literature_screening_records"),direct("pvos_literature_runs"),direct("pvos_literature_second_reviews"),direct("pvos_handovers"),joined("pvos_handover_companies","pvos_handovers"),direct("pvos_handover_evidence"),joined("pvos_products","pvos_companies"),joined("pvos_task_approvals","pvos_tasks"),
    readApprovalRows<Row>((from,to)=>client.from("pvos_audit_events").select("id,organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,created_at,before_status:before_data->>status,after_status:after_data->>status,reason:metadata->>reason,actor_email:metadata->>actor_email,linked_task_id:metadata->>task_id,linked_run_id:metadata->>run_id,linked_handover_id:metadata->>handover_id").eq("organization_id",organizationId).order("id").range(from,to)),
    readApprovalRows<Row>((from,to)=>client.from("pvos_audit_events").select("*").eq("organization_id",organizationId).in("entity_type",["approval","product_registration"]).order("id").range(from,to)),
    client.rpc("pvos_member_directory",{p_organization_id:organizationId})
  ]);
  if(directory.error)throw new Error(directory.error.message);
  const details=new Map(decisionEvents.map(a=>[a.id,a]));
  const audit=auditRows.map(a=>details.get(a.id)||a);
  const routes=[...new Set(approvals.map(a=>a.route_id).filter(Boolean))];
  const steps:Row[]=[];
  for(let i=0;i<routes.length;i+=100)steps.push(...await readApprovalRows<Row>((from,to)=>client.from("pvos_approval_steps").select("*").in("route_id",routes.slice(i,i+100)).order("id").range(from,to)));
  audit.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||Number(b.id)-Number(a.id));
  return {organizationId,loadedAt:new Date().toISOString(),companies,tasks,evidence,literatureRecords,runs,secondReviews,handovers,handoverCompanies,handoverEvidence,products,approvals,steps,audit,members:directory.data||[]};
}

export function scopeInspection(data:InspectionData,companyId:string):InspectionData{
  if(companyId==="all")return data;
  const tasks=data.tasks.filter(t=>t.company_id===companyId),taskIds=new Set(tasks.map(t=>t.id));
  const products=data.products.filter(p=>p.company_id===companyId),productIds=new Set(products.map(p=>p.id));
  const literatureRecords=data.literatureRecords.filter(r=>r.company_id===companyId);
  const runs=data.runs.filter(r=>r.company_id===companyId),runIds=new Set(runs.map(r=>r.id));
  const secondReviews=data.secondReviews.filter(r=>runIds.has(r.run_id));
  const handoverCompanies=data.handoverCompanies.filter(c=>c.company_id===companyId),handoverIds=new Set(handoverCompanies.map(c=>c.handover_id));
  const handovers=data.handovers.filter(h=>handoverIds.has(h.id));
  // Keep the complete original shared snapshot: projecting it would invalidate its recorded hash.
  const handoverEvidence=data.handoverEvidence.filter(e=>handoverIds.has(e.handover_id));
  const approvals=data.approvals.filter(a=>taskIds.has(a.task_id));
  const evidence=data.evidence.filter(e=>taskIds.has(e.task_id));
  const entities:Record<string,Set<any>>={task:taskIds,product_registration:productIds,approval:new Set(approvals.map(a=>a.id)),evidence:new Set(evidence.map(e=>e.id)),handover:handoverIds,handover_company:new Set(handoverCompanies.map(c=>c.id)),handover_evidence:new Set(handoverEvidence.map(e=>e.id)),literature_second_review:new Set(secondReviews.map(r=>r.id)),literature_screening_record:new Set(literatureRecords.map(r=>r.id)),literature_run:runIds};
  const audit=data.audit.filter(a=>a.company_id===companyId||entities[a.entity_type]?.has(a.entity_id)||taskIds.has(a.metadata?.task_id||a.linked_task_id)||runIds.has(a.metadata?.run_id||a.linked_run_id)||handoverIds.has(a.metadata?.handover_id||a.linked_handover_id));
  return {...data,companies:data.companies.filter(c=>c.id===companyId),tasks,products,literatureRecords,runs,secondReviews,handovers,handoverCompanies,handoverEvidence,approvals,evidence,audit};
}

export function inspectionAccount(data:InspectionData,id?:string|null){return id?data.members.find(m=>m.user_id===id)?.email||id:"Actor not recorded";}

export function inspectionApprovals(data:InspectionData):Row[]{
  const steps=Object.fromEntries(data.steps.map(s=>[s.route_id+"|"+s.position,s]));
  const tasks=Object.fromEntries(data.tasks.map(t=>[t.id,t]));
  const events=data.audit.filter(e=>e.entity_type==="approval"&&e.event_type==="update");
  return data.approvals.map(a=>{
    const actor=decisionAttribution(a,events,data.members);
    const event=events.find(e=>e.entity_id===a.id&&e.after_data?.status===a.status&&e.before_data?.status!==a.status);
    const decided=["approved","rejected","skipped"].includes(a.status);
    return {...a,task:tasks[a.task_id],step_role:a.decision_context?.step_role||steps[a.route_id+"|"+a.step_position]?.role||"Step "+a.step_position,
      actor:decided?actor:{name:"Awaiting decision",at:null,recorded:false},actor_id:decided?a.completed_by||event?.actor_user_id||null:null,
      outcome:decided?approvalOutcome(a,tasks[a.task_id],data.approvals,steps):"Awaiting decision"};
  });
}

export function inspectionChecks(data:InspectionData,now=Date.now()){
  const evidenceTasks=new Set(data.evidence.filter(e=>!e.archived_at).map(e=>e.task_id));
  const approvals=inspectionApprovals(data);
  const frozenHandovers=new Set(data.handoverEvidence.map(e=>e.handover_id));
  return {
    completedTasks:data.tasks.filter(t=>t.status==="complete").length,
    missingTaskEvidence:data.tasks.filter(t=>t.status==="complete"&&!evidenceTasks.has(t.id)).length,
    overdueTasks:data.tasks.filter(t=>!["complete","cancelled"].includes(t.status)&&t.due_at&&new Date(t.due_at).getTime()<now).length,
    unfinishedRuns:data.runs.filter(r=>r.status!=="complete"&&r.status!=="cancelled").length,
    pendingSecondReviews:data.secondReviews.filter(r=>r.status==="pending"||r.status==="returned").length,
    legacyLiterature:data.literatureRecords.filter(r=>r.metadata?.second_review?.status!=="approved").length,
    pendingApprovals:approvals.filter(a=>a.status==="pending"||a.status==="in_review").length,
    unattributedApprovals:approvals.filter(a=>["approved","rejected","skipped"].includes(a.status)&&!a.actor.recorded).length,
    missingHandoverEvidence:data.handovers.filter(h=>h.workflow_version===2&&["accepted","active","handback_pending","closed"].includes(h.status)&&!frozenHandovers.has(h.id)).length,
    unknownRegistration:data.products.filter(p=>!p.registration_status?.trim()||p.registration_status==="Not recorded").length,
    missingRegistrationNumber:data.products.filter(p=>p.registration_status?.toLowerCase()==="registered"&&!p.sfda_registration_number?.trim()).length
  };
}

export function auditDescription(a:Row){
  const before=a.before_data||{status:a.before_status},after=a.after_data||{status:a.after_status};
  if(a.entity_type==="product_registration")return a.event_type==="insert"?"Registration details recorded":`Registration updated: ${before.registration_status||"Not recorded"} → ${after.registration_status||"Not recorded"}`;
  if(a.entity_type==="handover_evidence")return "Deputy acknowledgement evidence frozen";
  if(a.entity_type==="literature_second_review")return a.event_type==="insert"?"Second review assigned":`Second review: ${after.status||a.event_type}`;
  if(a.entity_type==="literature_screening_record")return "Literature evidence snapshot recorded";
  if(a.event_type==="insert")return "Record created";
  if(a.event_type==="delete")return "Record deleted";
  if(after.status&&after.status!==before.status)return `Status: ${before.status||"Not recorded"} → ${after.status}`;
  if(!before.deputy_acknowledged_at&&after.deputy_acknowledged_at)return "Deputy acknowledged company";
  if(!before.qppv_handback_acknowledged_at&&after.qppv_handback_acknowledged_at)return "QPPV acknowledged handback";
  return "Record updated";
}

export function csvCell(value:unknown){
  let s=value==null?"":String(value);
  // Quoting does not stop spreadsheet formula evaluation. JSON retains exact original values.
  if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}

export function secondReviewScope(record:Row,decision:Row){
  const ids=record.metadata?.second_review?.metadata?.scope_item_ids;
  return Array.isArray(ids)?ids.includes(decision.literature_item_id||decision.id)?"Included":"Outside recorded scope":"Scope not recorded";
}

export function inspectionExport(data:InspectionData,companyId:string,generatedAt=new Date().toISOString()){
  const companyBy=Object.fromEntries(data.companies.map(c=>[c.id,c.name])),taskBy=Object.fromEntries(data.tasks.map(t=>[t.id,t]));
  const approvals=inspectionApprovals(data);
  const company=(id:string)=>companyBy[id]||id||"Organization / shared record";
  const account=(id:string)=>inspectionAccount(data,id);
  const sections:{name:string,headers:string[],rows:unknown[][]}[]=[];
  const section=(name:string,headers:string[],rows:unknown[][])=>sections.push({name,headers,rows});
  const cycles=(history:Row[]=[])=>history.map(h=>({cycle:h.cycle,status:h.status,note:h.note,assigned_to:h.assigned_to,assigned_by:h.assigned_by,assigned_at:h.assigned_at,reviewed_by:h.reviewed_by,reviewed_at:h.reviewed_at,scope_item_ids:h.metadata?.scope_item_ids}));
  section("EXPORT CONTEXT",["Organization ID","Company scope","Generated at UTC","Record reads completed at UTC","Audit reads completed at UTC","Read consistency","Shared handover snapshots","Files","Audit detail"],[[data.organizationId,companyId,generatedAt,data.loadedAt,data.auditLoadedAt||data.loadedAt,"Fetched database view; not an atomic database snapshot","Full original snapshots retained in JSON to preserve recorded hash","References only; document bytes remain on source records","CSV summarizes every audit event; full JSON retains original before/after data"]]);
  section("TASK REGISTER",["Task ID","Company","Task","Type","Status","Due UTC","Completed UTC","Active evidence records"],data.tasks.map(t=>[t.id,company(t.company_id),t.title,t.activity_type,t.status,t.due_at,t.completed_at,data.evidence.filter(e=>e.task_id===t.id&&!e.archived_at).length]));
  section("TASK EVIDENCE",["Evidence ID","Task ID","Company","Title","Type","Version","Recorded UTC","Uploaded by ID","Account label","File path","External reference","Archived UTC"],data.evidence.map(e=>[e.id,e.task_id,company(taskBy[e.task_id]?.company_id),e.title,e.evidence_type,e.version,e.created_at,e.uploaded_by,account(e.uploaded_by),e.file_path,e.external_url,e.archived_at]));
  section("SCREENING RUN REGISTER",["Run ID","Company","Period start","Period end","Status","Started UTC","Completed UTC","Started by ID","Completed by ID","Source count","Product count","Result count","Reviewed count"],data.runs.map(r=>[r.id,company(r.company_id),r.period_start,r.period_end,r.status,r.started_at,r.completed_at,r.started_by,r.completed_by,r.source_count,r.product_count,r.result_count,r.reviewed_count]));
  section("LITERATURE SCREENING RECORDS",["Evidence ID","Run ID","Company","Period start","Period end","Completed UTC","First reviewer IDs","Second reviewer ID","Second reviewed UTC","Second decision","Second note","Review cycles summary JSON","Sources JSON","Products JSON","Metrics JSON"],data.literatureRecords.map(r=>[r.id,r.run_id,company(r.company_id),r.period_start,r.period_end,r.completed_at,(r.metadata?.first_reviewer_user_ids||[]).join("; "),r.metadata?.second_review?.reviewed_by,r.metadata?.second_review?.reviewed_at,r.metadata?.second_review?.status||"Legacy / not recorded",r.metadata?.second_review?.note,JSON.stringify(cycles(r.metadata?.second_review?.metadata?.history)),JSON.stringify(r.source_snapshot),JSON.stringify(r.product_snapshot),JSON.stringify(r.metrics)]));
  section("LITERATURE DECISIONS",["Evidence ID","Run ID","Item ID","Article","Product","First decision","First reviewer ID","First reviewed UTC","First note","Second-review scope","Second reviewer ID","Second reviewed UTC","Downstream actions JSON"],data.literatureRecords.flatMap(r=>(r.decision_snapshot||[]).map((d:Row)=>{const scope=secondReviewScope(r,d);return [r.id,r.run_id,d.literature_item_id,d.title,d.product,d.review_status,d.reviewer_user_id,d.reviewed_at,d.decision_note,scope,scope==="Included"?r.metadata?.second_review?.reviewed_by:null,scope==="Included"?r.metadata?.second_review?.reviewed_at:null,JSON.stringify(d.followups||[])];})));
  section("SECOND REVIEW WORKFLOW",["Review ID","Run ID","Assigned account ID","Assigned UTC","Status","Decision account ID","Decision UTC","Reason / note","Selected item IDs JSON","Earlier cycle summaries JSON"],data.secondReviews.map(r=>[r.id,r.run_id,r.assigned_to,r.assigned_at,r.status,r.reviewed_by,r.reviewed_at,r.note,JSON.stringify(r.metadata?.scope_item_ids||[]),JSON.stringify(cycles(r.metadata?.history))]));
  section("HANDOVER REGISTER",["Handover ID","Leave start","Leave end","Current status","Workflow version","QPPV ID","Deputy ID","Accepted UTC","Handback closed UTC","Evidence ID","Evidence frozen UTC","Full snapshot SHA-256"],data.handovers.map(h=>{const e=data.handoverEvidence.find(e=>e.handover_id===h.id);return [h.id,h.leave_start,h.leave_end,h.status,h.workflow_version,h.qppv_user_id,h.deputy_user_id,h.accepted_at,h.handback_at,e?.id,e?.created_at,e?.snapshot_sha256];}));
  section("COMPANY HANDOVER ACKNOWLEDGEMENTS",["Record ID","Handover ID","Company","Deputy account ID","Deputy acknowledged UTC","QPPV handback account ID","QPPV handback UTC","Open tasks at snapshot","Due during leave","Snapshot risk"],data.handoverCompanies.map(c=>[c.id,c.handover_id,company(c.company_id),c.deputy_acknowledged_by,c.deputy_acknowledged_at,c.qppv_handback_acknowledged_by,c.qppv_handback_acknowledged_at,c.snapshot?.open_tasks,c.snapshot?.due_during_leave,c.snapshot?.risk]));
  section("HANDOVER TASK SNAPSHOT",["Handover ID","Company record ID","Company","Task ID","Task at snapshot","Type at snapshot","Status at snapshot","Priority at snapshot","Due at snapshot UTC"],data.handoverCompanies.flatMap(c=>(c.snapshot?.tasks||[]).map((t:Row)=>[c.handover_id,c.id,company(c.company_id),t.id,t.title,t.activity_type,t.status,t.priority,t.due_at])));
  section("APPROVAL DECISIONS",["Approval ID","Task ID","Company","Task","Step","Status","Assigned account ID","Decision account ID","Decision account label","Decision UTC","Actor recorded","Workspace role at decision","Recorded destination / outcome","Comment","Decision context JSON"],approvals.map(a=>[a.id,a.task_id,company(a.task?.company_id),a.decision_context?.task_title||a.task?.title,a.step_role,a.status,a.assigned_user_id,a.actor_id,a.actor.name,a.actor.at,a.actor.recorded?"Yes":"No",a.decision_context?.acting_workspace_role,a.outcome,a.comment,JSON.stringify(a.decision_context)]));
  section("PRODUCT REGISTRATION",["Product ID","Company","Product","Ingredient","User-recorded status","SFDA number","Registration reference","Last change reason","Product updated UTC","Verification basis"],data.products.map(p=>[p.id,company(p.company_id),p.brand_name,p.active_ingredient,p.registration_status||"Not recorded",p.sfda_registration_number,p.registration_reference,p.registration_change_reason,p.updated_at,"User-recorded; no automatic SFDA registry verification"]));
  const registration=data.audit.filter(a=>a.entity_type==="product_registration");
  section("REGISTRATION CHANGE HISTORY",["Audit ID","Product ID","Company","Recorded UTC","Account ID","Account label","Before status","After status","Before SFDA number","After SFDA number","Before reference","After reference","Reason"],registration.map(a=>[a.id,a.entity_id,company(a.company_id),a.created_at,a.actor_user_id,a.metadata?.actor_email||account(a.actor_user_id),a.before_data?.registration_status,a.after_data?.registration_status,a.before_data?.sfda_registration_number,a.after_data?.sfda_registration_number,a.before_data?.registration_reference,a.after_data?.registration_reference,a.metadata?.reason]));
  section("AUDIT HISTORY",["Audit ID","Recorded UTC","Company / scope","Entity","Entity ID","Event","Account ID","Account label","Action","Before status","After status","Reason / note"],data.audit.map(a=>[a.id,a.created_at,company(a.company_id),a.entity_type,a.entity_id,a.event_type,a.actor_user_id,a.metadata?.actor_email||a.actor_email||account(a.actor_user_id),auditDescription(a),a.before_data?.status||a.before_status,a.after_data?.status||a.after_status,a.metadata?.reason||a.metadata?.note||a.reason]));
  const csv="\uFEFF"+sections.map(s=>"# PVOS "+s.name+"\n"+[s.headers,...s.rows].map(r=>r.map(csvCell).join(",")).join("\n")).join("\n\n");
  const {members,steps,...records}=data;
  const json={export_version:"inspection-v2",generated_at:generatedAt,company_scope:companyId,read_consistency:"Fetched database view; not an atomic snapshot",shared_handover_snapshots:"Original full snapshots retained; recorded SHA-256 applies to the full original snapshot, not a company projection",file_contents:"References only; document bytes remain on source records",account_label_basis:"CSV labels use frozen decision emails where recorded, otherwise the current member directory or exact account ID",records,approval_decision_summary:approvals,registration_history:registration};
  return {csv,json};
}
