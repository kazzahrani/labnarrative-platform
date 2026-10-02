export function dueLabel(dueAt:string|null|undefined, status?:string) {
  if (status === "complete") return "Complete";
  if (status === "awaiting_review" || status === "awaiting_external") return "Awaiting approval";
  if (status === "in_progress") return "In progress";
  if (!dueAt) return "No deadline";
  const due = new Date(dueAt);
  const now = new Date();
  const startNow = new Date(now); startNow.setHours(0,0,0,0);
  const startDue = new Date(due); startDue.setHours(0,0,0,0);
  const diff = Math.round((startDue.getTime()-startNow.getTime())/86400000);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Due today";
  if (diff <= 7) return "Due soon";
  return "Scheduled";
}

export function formatDue(dueAt:string|null|undefined) {
  if (!dueAt) return "—";
  const d = new Date(dueAt);
  const today = new Date(); today.setHours(0,0,0,0);
  const day = new Date(d); day.setHours(0,0,0,0);
  const diff = Math.round((day.getTime()-today.getTime())/86400000);
  if (diff===0) return "Today";
  if (diff===1) return "Tomorrow";
  return new Intl.DateTimeFormat("en",{day:"numeric",month:"short"}).format(d);
}

export function niceStatus(status:string) {
  return status.split("_").map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(" ");
}
