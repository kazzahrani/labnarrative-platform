export type PVTemplate = {
  id: string;
  title: string;
  activityType: string;
  cadence: "weekly" | "monthly" | "semiannual" | "annual" | "event";
  description: string;
  defaultDays?: number;
};

export const PV_TEMPLATES: PVTemplate[] = [
  { id:"weekly-literature", title:"Weekly literature review", activityType:"Literature", cadence:"weekly", defaultDays:7, description:"Local literature screening with documented QPPV review." },
  { id:"monthly-signal", title:"Monthly health authority & signal review", activityType:"Signal", cadence:"monthly", defaultDays:30, description:"Review authority updates and safety signals relevant to the portfolio." },
  { id:"monthly-reconciliation", title:"Monthly case reconciliation", activityType:"Reconciliation", cadence:"monthly", defaultDays:30, description:"Reconcile safety cases with vendors, partners and internal records." },
  { id:"monthly-pssf", title:"PSSF monthly maintenance", activityType:"PSSF", cadence:"monthly", defaultDays:30, description:"Routine PSSF review, annex maintenance and system-change check." },
  { id:"semiannual-training", title:"PV refresher training", activityType:"Training", cadence:"semiannual", defaultDays:180, description:"Track recurring PV training, assessment and evidence." },
  { id:"annual-pssf", title:"PSSF annual deep review", activityType:"PSSF", cadence:"annual", defaultDays:365, description:"Annual deeper PSSF review in addition to routine maintenance." },
  { id:"annual-sop", title:"PV SOP annual review", activityType:"SOP", cadence:"annual", defaultDays:365, description:"Scheduled review of PV SOPs and documented update decision." },
  { id:"rmp-event", title:"RMP / risk minimization action", activityType:"RMP", cadence:"event", description:"Event-driven RMP or risk-minimization work triggered by product or authority requirements." },
  { id:"psur-event", title:"PSUR / PBRER requirement", activityType:"PSUR/PBRER", cadence:"event", description:"Keep product-specific reporting event-driven until its exact schedule is confirmed." },
  { id:"sfda-event", title:"SFDA inquiry / commitment", activityType:"SFDA Inquiry", cadence:"event", description:"Track ad-hoc SFDA requests, owners, deadlines and evidence through closure." }
];

export function suggestedDueDate(t:PVTemplate){
  if(t.cadence==="event") return "";
  const d=new Date();
  d.setDate(d.getDate()+(t.defaultDays||30));
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
