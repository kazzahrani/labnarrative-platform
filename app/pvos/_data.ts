export type TaskStatus = "Overdue" | "Due today" | "Due soon" | "In progress" | "Awaiting approval" | "Complete";
export type Priority = "High" | "Medium" | "Low";

export type Task = {
  id: string;
  companyId: string;
  company: string;
  product?: string;
  title: string;
  type: string;
  owner: string;
  due: string;
  status: TaskStatus;
  priority: Priority;
  evidence?: number;
  approvalStage?: string;
};

export const companies = [
  { id:"alpha", name:"Alpha Pharma", products:42, dueWeek:4, overdue:0, qppv:"Dalal AlHuzaimi", deputy:"Sarah M.", contract:"PV full service" },
  { id:"beta", name:"Beta Pharma", products:18, dueWeek:2, overdue:0, qppv:"Dalal AlHuzaimi", deputy:"Sarah M.", contract:"Literature + ICSR" },
  { id:"gamma", name:"Gamma Therapeutics", products:9, dueWeek:1, overdue:0, qppv:"Dalal AlHuzaimi", deputy:"Mona A.", contract:"Local QPPV" },
  { id:"delta", name:"Delta Biologics", products:27, dueWeek:3, overdue:1, qppv:"Dalal AlHuzaimi", deputy:"Mona A.", contract:"PV full service" },
  { id:"epsilon", name:"Epsilon Pharma", products:11, dueWeek:1, overdue:0, qppv:"Dalal AlHuzaimi", deputy:"Sarah M.", contract:"PSSF + Training" },
  { id:"zeta", name:"Zeta Medical", products:31, dueWeek:2, overdue:0, qppv:"Dalal AlHuzaimi", deputy:"Sarah M.", contract:"Signal + Literature" },
];

export const products = [
  { id:"oncora", companyId:"alpha", name:"Oncora", ingredient:"osimeritinib", status:"Registered", rmp:"Active", nextReview:"18 Oct" },
  { id:"cardiovex", companyId:"alpha", name:"Cardiovex", ingredient:"apixaban", status:"Registered", rmp:"Routine", nextReview:"3 Nov" },
  { id:"neurovia", companyId:"delta", name:"Neurovia", ingredient:"fingolimod", status:"Registered", rmp:"Active", nextReview:"9 Oct" },
  { id:"metaglix", companyId:"beta", name:"Metaglix", ingredient:"metformin", status:"Registered", rmp:"Routine", nextReview:"21 Nov" },
];

export const tasks: Task[] = [
  { id:"rmp-drug-a", companyId:"alpha", company:"Alpha Pharma", product:"Oncora", title:"RMP annual review", type:"RMP", owner:"Me", due:"Today", status:"Due today", priority:"High", evidence:3 },
  { id:"lit-beta", companyId:"beta", company:"Beta Pharma", title:"Weekly literature review", type:"Literature", owner:"Me", due:"Today", status:"Due today", priority:"Medium", evidence:1 },
  { id:"pssf-gamma", companyId:"gamma", company:"Gamma Therapeutics", title:"PSSF monthly maintenance", type:"PSSF", owner:"Deputy", due:"Tomorrow", status:"Due soon", priority:"Medium", evidence:2 },
  { id:"training-alpha", companyId:"alpha", company:"Alpha Pharma", title:"Medical representative refresher training", type:"Training", owner:"HR", due:"7 Oct", status:"Awaiting approval", priority:"Medium", evidence:5, approvalStage:"Quality" },
  { id:"sfda-delta", companyId:"delta", company:"Delta Biologics", product:"Neurovia", title:"SFDA safety inquiry response", type:"SFDA Inquiry", owner:"Me", due:"4 Oct", status:"Overdue", priority:"High", evidence:4, approvalStage:"Medical" },
  { id:"sop-epsilon", companyId:"epsilon", company:"Epsilon Pharma", title:"SOP-07 annual review", type:"SOP", owner:"Me", due:"9 Oct", status:"In progress", priority:"Low", evidence:2 },
  { id:"signal-zeta", companyId:"zeta", company:"Zeta Medical", title:"Monthly authority & signal review", type:"Signal", owner:"Me", due:"11 Oct", status:"Due soon", priority:"Medium", evidence:1 },
  { id:"recon-beta", companyId:"beta", company:"Beta Pharma", title:"Monthly case reconciliation", type:"Reconciliation", owner:"PV Specialist", due:"12 Oct", status:"Due soon", priority:"Medium", evidence:2 },
];

export const approvalItems = [
  { id:"approval-1", company:"Alpha Pharma", document:"RMP Annex v3", workflow:["QPPV","Deputy","Quality","Client"], current:"Quality", waiting:"2d 4h", started:"30 Sep 10:42" },
  { id:"approval-2", company:"Delta Biologics", document:"SFDA inquiry response", workflow:["QPPV","Medical","Quality","Manager"], current:"Medical", waiting:"18h", started:"1 Oct 15:10" },
  { id:"approval-3", company:"Beta Pharma", document:"Literature review Week 40", workflow:["PV Specialist","QPPV"], current:"QPPV", waiting:"5h", started:"2 Oct 08:35" },
];

export const handovers = [
  { company:"Alpha Pharma", open:4, next:"RMP review today", risk:"High" },
  { company:"Beta Pharma", open:2, next:"Literature review today", risk:"Medium" },
  { company:"Gamma Therapeutics", open:1, next:"PSSF tomorrow", risk:"Low" },
  { company:"Delta Biologics", open:3, next:"SFDA inquiry overdue", risk:"High" },
];

export const inspection = [
  { label:"Literature review cycles", score:"12/12", state:"good" },
  { label:"Signal review cycles", score:"9/10", state:"warn" },
  { label:"PSSF maintenance", score:"Current", state:"good" },
  { label:"Training records", score:"2 approaching expiry", state:"warn" },
  { label:"Open CAPAs", score:"1", state:"warn" },
  { label:"Tasks missing evidence", score:"3", state:"bad" },
];
