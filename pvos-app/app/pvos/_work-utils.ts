export function riyadhDay(value:Date|string=new Date()) {
  const d=new Date(value);if(Number.isNaN(d.getTime()))return "";
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
}
export function deadlineState(due?:string|null,status?:string,now:Date=new Date()) {
  if(status==="complete"||status==="cancelled"||!due)return {label:"",overdue:false,days:null};
  const day=due.length===10?due:riyadhDay(due),today=riyadhDay(now);
  const diff=Math.round((Date.parse(day+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000);
  if(!Number.isFinite(diff))return {label:"",overdue:false,days:null};
  return {label:diff<0?`${-diff} day${diff===-1?"":"s"} overdue`:diff===0?"Due today":diff<=7?"Due this week":"Scheduled",overdue:diff<0,days:diff};
}
export function activityLink(t:any) {
  if(t.status==="complete")return {href:"/pvos/tasks/"+t.id+"#evidence",label:"View record"};
  const query=new URLSearchParams({company:t.company_id,task:t.id});
  if(t.activity_type==="authority_monitoring"&&t.metadata?.authority_period_id)return {href:"/pvos/signal?view=authority&authorityPeriod="+t.metadata.authority_period_id+"&company="+t.company_id,label:t.status==="awaiting_review"?"View monitoring review":"Continue monitoring"};
  if(t.activity_type==="Literature") {
    query.set("view","queue");
    const run=t.metadata?.literature_run_id||t.metadata?.run_id;
    if(run)query.set("run",run);
    if(t.due_at)query.set("due",riyadhDay(t.due_at));
    return {href:"/pvos/literature?"+query,label:run?"Continue screening":"Open screenings"};
  }
  if(t.activity_type==="RMP") {
    if(t.product_id)query.set("product",t.product_id);
    return {href:"/pvos/rmp?"+query,label:"Open RMP"};
  }
  return {href:"/pvos/tasks/"+t.id,label:t.status==="complete"?"View record":t.status==="awaiting_review"?"View review":t.status==="awaiting_external"?"Follow up":t.status==="in_progress"?"Continue work":"Open task"};
}
export function isHistoricalRun(run:any,now:Date=new Date()) {
  if(run.metadata?.automated||run.metadata?.purpose==="routine")return false;
  if(run.metadata?.purpose==="historical")return true;
  // Ad-hoc manual searches belong in Literature history unless they are
  // explicitly marked as routine work. Recency alone must not make a test or
  // retrospective search appear in the QPPV's weekly inbox.
  return true;
}

