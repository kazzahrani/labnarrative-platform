"use client";
import {pvosSupabase} from "./_pvos-supabase";
import {readApprovalRows,canApproveStep,type Member} from "./_approval";
import {activityLink,isHistoricalRun} from "./_work-utils";
export type WorkItem={id:string,company_id:string,title:string,kind:string,status:string,owner?:string|null,due?:string|null,href:string,action:string,review:boolean,waiting?:boolean};
export type WorkData={tasks:any[],companies:any[],members:Member[],items:WorkItem[]};
export async function readWork(org:string,userId:string):Promise<WorkData> {
  const rows=(table:string,select="*")=>readApprovalRows<any>((from,to)=>pvosSupabase.from(table).select(select).eq("organization_id",org).order("id").range(from,to));
  const [tasks,companies,runs,decisions,records,second,reviews,approvals,handovers,authorityReviews,authorityPeriods,memberResult]=await Promise.all([
    rows("pvos_tasks"),rows("pvos_companies"),rows("pvos_literature_runs"),rows("pvos_literature_items","id,run_id,review_status,reviewer_user_id"),rows("pvos_literature_screening_records","id,run_id"),rows("pvos_literature_second_reviews"),rows("pvos_task_reviews"),
    readApprovalRows<any>((from,to)=>pvosSupabase.from("pvos_task_approvals").select("*,pvos_tasks!inner(organization_id,company_id,title,due_at)").eq("pvos_tasks.organization_id",org).order("id").range(from,to)),rows("pvos_handovers"),rows("pvos_authority_reviews"),rows("pvos_authority_periods"),pvosSupabase.rpc("pvos_member_directory",{p_organization_id:org})
  ]);
  if(memberResult.error)throw new Error(memberResult.error.message);
  const members:Member[]=memberResult.data||[],taskBy=Object.fromEntries(tasks.map(t=>[t.id,t]));
  const routeIds=[...new Set(approvals.map(a=>a.route_id).filter(Boolean))] as string[];
  const steps:any[]=[];for(let i=0;i<routeIds.length;i+=100)steps.push(...await readApprovalRows<any>((from,to)=>pvosSupabase.from("pvos_approval_steps").select("*").in("route_id",routeIds.slice(i,i+100)).order("id").range(from,to)));
  const stepBy=Object.fromEntries(steps.map(s=>[s.route_id+"|"+s.position,s]));
  const items:WorkItem[]=tasks.filter(t=>t.status!=="cancelled").map(t=>({id:"task:"+t.id,company_id:t.company_id,title:t.title,kind:t.activity_type,status:t.status,owner:t.owner_user_id,due:t.due_at,...activityLink(t),action:activityLink(t).label,review:false,waiting:["awaiting_review","awaiting_external"].includes(t.status)}));
  const completed=new Set(records.map(r=>r.run_id));
  const decisionBy=new Map<string,any[]>();for(const d of decisions){const list=decisionBy.get(d.run_id)||[];list.push(d);decisionBy.set(d.run_id,list);}
  const secondBy=Object.fromEntries(second.map(s=>[s.run_id,s]));
  const companyBy=Object.fromEntries(companies.map(c=>[c.id,c]));
  for(const run of runs.filter(r=>!completed.has(r.id)&&r.status!=="cancelled")) {
    const sr=secondBy[run.id],ds=decisionBy.get(run.id)||[],open=ds.filter(d=>["unreviewed","needs_review"].includes(d.review_status)).length;
    // Historical searches remain in Literature; they do not inflate the weekly inbox.
    if(isHistoricalRun(run)&&sr?.status!=="pending"&&sr?.status!=="returned")continue;
    const mine=sr?.status==="pending"&&sr.assigned_to===userId;
    items.push({id:"screening:"+run.id,company_id:run.company_id,title:`Literature · ${run.period_start} – ${run.period_end}`,kind:mine?"Literature second review":"Literature screening",status:completed.has(run.id)?"complete":sr?.status==="pending"?"awaiting_review":sr?.status==="returned"?"returned":sr?.status==="approved"?"ready_to_complete":open?`${open} unresolved`:"ready_for_review",owner:sr?.status==="pending"?sr.assigned_to:run.started_by||companyBy[run.company_id]?.qppv_user_id,due:null,href:`/pvos/literature?company=${run.company_id}&view=${sr?.status==="pending"?"second":"queue"}&run=${run.id}`,action:mine?"Review screening":sr?.status==="pending"?"View review":sr?.status==="returned"?"Resolve corrections":sr?.status==="approved"?"Complete record":"Continue screening",review:mine,waiting:sr?.status==="pending"});
  }
  for(const run of runs.filter(r=>completed.has(r.id)))items.push({id:"record:"+run.id,company_id:run.company_id,title:`Literature · ${run.period_start} – ${run.period_end}`,kind:"Literature screening",status:"complete",owner:run.started_by||companyBy[run.company_id]?.qppv_user_id,due:null,href:`/pvos/literature?company=${run.company_id}&inspectionRun=${run.id}`,action:"View record",review:false});
  for(const r of reviews.filter(r=>r.status==="pending")) {const t=taskBy[r.task_id];if(!t)continue;items.push({id:"review:"+r.id,company_id:r.company_id,title:r.snapshot?.task?.title||t.title,kind:"Task review",status:"awaiting_review",owner:r.assigned_to,due:t.due_at,href:`/pvos/tasks/${r.task_id}#task-review`,action:r.assigned_to===userId?"Review submission":"View review",review:r.assigned_to===userId,waiting:true});}
  for(const a of approvals.filter(a=>a.status==="in_review")) {const step=stepBy[a.route_id+"|"+a.step_position],mine=canApproveStep(a,step,userId,members);items.push({id:"approval:"+a.id,company_id:a.pvos_tasks.company_id,title:a.pvos_tasks.title,kind:`Approval · ${step?.role||"Step "+a.step_position}`,status:"awaiting_review",owner:a.assigned_user_id||(mine?userId:null),due:a.pvos_tasks.due_at,href:`/pvos/tasks/${a.task_id}#approval`,action:mine?"Review submission":"View approval",review:mine,waiting:true});}
  const periodBy=Object.fromEntries(authorityPeriods.map(p=>[p.id,p]));
  for(const r of authorityReviews.filter(r=>r.status==="pending")){const p=periodBy[r.period_id];if(!p)continue;items.push({id:"authority-review:"+r.id,company_id:r.company_id,title:`Authority monitoring · ${p.period_start} – ${p.period_end}`,kind:"Authority review",status:"awaiting_review",owner:r.assigned_to,due:p.due_at,href:`/pvos/signal?view=authority&authorityPeriod=${p.id}&company=${r.company_id}`,action:r.assigned_to===userId?"Review monitoring":"View review",review:r.assigned_to===userId,waiting:true});}
  if(handovers.length) {
    const ids=handovers.map(h=>h.id);const children:any[]=[];
    for(let i=0;i<ids.length;i+=100)children.push(...await readApprovalRows<any>((from,to)=>pvosSupabase.from("pvos_handover_companies").select("*").in("handover_id",ids.slice(i,i+100)).order("id").range(from,to)));
    for(const h of handovers.filter(h=>h.status!=="closed"))for(const c of children.filter(c=>c.handover_id===h.id)) {
      const ack=h.status==="sent"&&!c.deputy_acknowledged_at,back=h.status==="handback_pending"&&!c.qppv_handback_acknowledged_at,owner=ack?h.deputy_user_id:h.qppv_user_id;
      if(!ack&&!back&&!["accepted","active"].includes(h.status))continue;
      items.push({id:"handover:"+c.id,company_id:c.company_id,title:`Leave handover · ${h.leave_start} – ${h.leave_end}`,kind:"Handover",status:ack?"awaiting_acknowledgement":back?"handback_pending":h.status,owner,due:null,href:"/pvos/handover/"+h.id,action:ack?"Acknowledge handover":back?"Review handback":"Open handover",review:(ack||back)&&owner===userId,waiting:ack||back});
    }
  }
  return {tasks,companies,members,items};
}
