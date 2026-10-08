import { readApprovalRows } from "./_approval";
export type ChecklistRow=Record<string,any>;
export const checklistLabels:Record<string,string>={missing_evidence:"Missing evidence",awaiting_review:"Awaiting review",needs_review:"Needs re-review",reviewed:"Reviewed",not_applicable:"Not applicable"};
export function checklistStatus(item:ChecklistRow){return item.effective_status||item.status||"missing_evidence";}
export function checklistCounts(items:ChecklistRow[]){
  const counts:Record<string,number>={missing_evidence:0,awaiting_review:0,needs_review:0,reviewed:0,not_applicable:0};
  for(const item of items)counts[checklistStatus(item)]=(counts[checklistStatus(item)]||0)+1;
  return counts;
}
export async function loadInspectionChecklist(client:any,organizationId:string){
  const direct=(table:string)=>readApprovalRows<ChecklistRow>((from,to)=>client.from(table).select("*").eq("organization_id",organizationId).order("id").range(from,to));
  const [items,checklistLinks,checklistReviews]=await Promise.all([client.rpc("pvos_get_inspection_checklist",{p_organization_id:organizationId}),direct("pvos_inspection_checklist_links"),direct("pvos_inspection_checklist_reviews")]);
  if(items.error)throw new Error(items.error.message);
  return {checklistItems:items.data||[],checklistLinks,checklistReviews};
}
