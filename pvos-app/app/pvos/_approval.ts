export type Member={user_id:string;email:string;role:string};

export async function readApprovalRows<T>(fetchPage:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:any}>){
  const rows:T[]=[];
  for(let from=0;;from+=1000){const {data,error}=await fetchPage(from,from+999);if(error)throw new Error(error.message||"Could not load approval records");rows.push(...(data??[]));if((data??[]).length<1000)return rows;}
}

export function canApproveStep(a:any,step:any,userId:string|undefined,members:Member[]){
  if(!userId||a.status!=="in_review")return false;
  const member=members.find(m=>m.user_id===userId);if(!member)return false;
  if(a.assigned_user_id)return a.assigned_user_id===userId;
  if(member.role==="admin")return true;
  const roles:Record<string,string>={qppv:"qppv","deputy qppv":"deputy_qppv",deputy_qppv:"deputy_qppv",quality:"quality",manager:"manager"};
  return member.role===roles[String(step?.role??"").toLowerCase()];
}

export function decisionAttribution(a:any,audit:any[],members:Member[]){
  // Assignment is not proof of who actually made a decision. Seeded/older decisions stay explicit.
  const event=audit.find(e=>e.entity_id===a.id&&e.event_type==="update"&&e.after_data?.status===a.status&&e.before_data?.status!==a.status);
  const id=a.completed_by||event?.actor_user_id;
  return {name:a.completed_by_email||members.find(m=>m.user_id===id)?.email||id||"Approver not recorded",
    at:a.completed_by?a.completed_at:event?.created_at||a.completed_at,
    recorded:Boolean(id)};
}

export function approvalOutcome(a:any,task:any,all:any[],stepBy:Record<string,any>){
  if(a.decision_context?.destination==="task_complete")return "Final approval → task completed";
  if(a.decision_context?.destination==="next_step")return "Sent to "+a.decision_context.next_step_role;
  if(a.status==="rejected")return "Rejected — review the task record";
  if(a.status==="skipped")return "Skipped — see audit history";
  const later=all.filter(x=>x.task_id===a.task_id&&x.step_position>a.step_position).sort((x,y)=>x.step_position-y.step_position);
  if(later.length)return "Later step: "+(stepBy[later[0].route_id+"|"+later[0].step_position]?.role??"Step "+later[0].step_position);
  return task?.status==="complete"?"Task completed":"Previous approval — task remains open";
}
