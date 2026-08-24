"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./manual-awaed.module.css";

type AssetKind = "سهم" | "صندوق" | "مرابحة" | "صك" | "ريت" | "نقد" | "أخرى";
type Row = {
  key: string;
  holdingId?: string;
  name: string;
  type: AssetKind;
  symbol: string;
  quantity: string;
  averageCost: string;
  currentValue: string;
  unitPrice: number | null;
};

type Baseline = Record<string, { name:string; type:AssetKind; symbol:string; quantity:number; averageCost:number; currentValue:number }>;

const kinds: AssetKind[] = ["سهم","ريت","صندوق","مرابحة","صك","نقد","أخرى"];
const eastern = "٠١٢٣٤٥٦٧٨٩";
const persian = "۰۱۲۳۴۵۶۷۸۹";

function normalizeNumber(input:string){
  let v=input.replace(/[٠-٩]/g,d=>String(eastern.indexOf(d))).replace(/[۰-۹]/g,d=>String(persian.indexOf(d))).replace(/٫/g,".").replace(/[٬,\s\u200e\u200f\u202a-\u202e]/g,"").replace(/[^0-9.\-]/g,"");
  const neg=v.startsWith("-"); v=v.replace(/-/g,""); const [w="",...d]=v.split("."); const n=d.length?`${w}.${d.join("")}`:w; return `${neg?"-":""}${n}`;
}
function num(v:string){const n=Number(normalizeNumber(v));return Number.isFinite(n)?n:0}
function sar(v:number){return new Intl.NumberFormat("ar-SA",{maximumFractionDigits:2}).format(v)}
function kindFrom(type:string):AssetKind{if(type==="saudi_stock")return"سهم";if(type==="reit")return"ريت";if(type==="fund")return"صندوق";if(type==="murabaha")return"مرابحة";if(type==="sukuk")return"صك";if(type==="cash")return"نقد";return"أخرى"}
function assetType(type:AssetKind){if(type==="سهم")return"saudi_stock";if(type==="ريت")return"reit";if(type==="صندوق")return"fund";if(type==="مرابحة")return"murabaha";if(type==="صك")return"sukuk";if(type==="نقد")return"cash";return"other"}
function blank(key:string):Row{return{key,name:"",type:"صندوق",symbol:"",quantity:"",averageCost:"",currentValue:"",unitPrice:null}}
function isMarketManaged(row:Row){return (row.type==="سهم"||row.type==="ريت")&&row.symbol.trim().length>0&&row.unitPrice!==null&&row.unitPrice>0}
function rowValue(row:Row){const q=num(row.quantity);return isMarketManaged(row)&&q>0?(row.unitPrice as number)*q:num(row.currentValue)}

export default function ManualAwaedClientV3(){
  const seq=useRef(1);
  const [rows,setRows]=useState<Row[]>([]);
  const [baseline,setBaseline]=useState<Baseline>({});
  const [email,setEmail]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [error,setError]=useState("");
  const [result,setResult]=useState<{added:number;updated:number;removed:number;adjustments:number}|null>(null);

  async function load(){
    setLoading(true); setError("");
    const {data:sessionData,error:sessionError}=await browserSupabase.auth.getSession();
    if(sessionError){setError(sessionError.message);setLoading(false);return}
    const session=sessionData.session;
    if(!session){setRows([]);setLoading(false);return}
    setEmail(session.user.email??"");
    const {data:account,error:accountError}=await browserSupabase.from("wealth_accounts").select("id").eq("user_id",session.user.id).eq("provider","Awaed").eq("portfolio_kind","real").neq("status","archived").order("created_at",{ascending:true}).limit(1).maybeSingle();
    if(accountError){setError(accountError.message);setLoading(false);return}
    if(!account){const r=blank(`new-${seq.current++}`);setRows([r]);setBaseline({});setLoading(false);return}
    const {data:holdings,error:hError}=await browserSupabase.from("wealth_holdings").select("id,asset_name,symbol,asset_type,quantity,unit_price,market_value,cost_basis").eq("user_id",session.user.id).eq("account_id",account.id).eq("portfolio_kind","real").order("created_at",{ascending:true});
    if(hError){setError(hError.message);setLoading(false);return}
    const next=(holdings??[]).map(h=>{const q=Number(h.quantity??0);const cost=Number(h.cost_basis??0);return{key:String(h.id),holdingId:String(h.id),name:String(h.asset_name??""),type:kindFrom(String(h.asset_type??"other")),symbol:String(h.symbol??""),quantity:q?String(q):"",averageCost:q>0&&cost>0?String(cost/q):"",currentValue:h.market_value==null?"":String(Number(h.market_value)),unitPrice:h.unit_price==null?null:Number(h.unit_price)} as Row});
    const base:Baseline={}; for(const r of next){base[r.holdingId!]={name:r.name,type:r.type,symbol:r.symbol,quantity:num(r.quantity),averageCost:num(r.averageCost),currentValue:rowValue(r)}}
    setRows(next.length?next:[blank(`new-${seq.current++}`)]); setBaseline(base); setLoading(false);
  }

  useEffect(()=>{void load()},[]);
  const touched=useMemo(()=>rows.filter(r=>r.name.trim()||r.symbol.trim()||r.quantity.trim()||r.averageCost.trim()||r.currentValue.trim()),[rows]);
  const invalid=useMemo(()=>touched.filter(r=>{if(!r.name.trim())return true;const q=num(r.quantity);if((r.type==="سهم"||r.type==="ريت")&&r.symbol.trim()&&q>0)return false;return rowValue(r)<=0}),[touched]);
  const total=useMemo(()=>touched.reduce((s,r)=>s+Math.max(0,rowValue(r)),0),[touched]);
  const cost=useMemo(()=>touched.reduce((s,r)=>{const q=num(r.quantity),a=num(r.averageCost);return s+(q>0&&a>0?q*a:0)},0),[touched]);
  const changes=useMemo(()=>{
    let added=0,changed=0,removed=0;
    const live=new Set<string>();
    for(const r of touched){if(!r.holdingId){added++;continue}live.add(r.holdingId);const b=baseline[r.holdingId];if(!b)continue;const diff=b.name!==r.name.trim()||b.type!==r.type||b.symbol!==r.symbol.trim()||Math.abs(b.quantity-num(r.quantity))>1e-8||Math.abs(b.averageCost-num(r.averageCost))>1e-6;if(diff)changed++}
    for(const id of Object.keys(baseline))if(!live.has(id))removed++;
    return{added,changed,removed,total:added+changed+removed};
  },[touched,baseline]);

  function patch(key:string,p:Partial<Row>){setRows(cur=>cur.map(r=>r.key===key?{...r,...p}:r));setSaved(false);setResult(null);setError("")}
  function numberPatch(key:string,field:"quantity"|"averageCost"|"currentValue",value:string){patch(key,{[field]:normalizeNumber(value)} as Partial<Row>)}
  function add(){setRows(cur=>[...cur,blank(`new-${seq.current++}`)]);setSaved(false)}
  function remove(key:string){setRows(cur=>cur.filter(r=>r.key!==key));setSaved(false);setResult(null)}

  async function save(){
    setError("");setSaved(false);setResult(null);
    if(invalid.length){setError("يوجد صف غير مكتمل. للأسهم والـREIT يكفي الاسم والرمز والكمية؛ وبقية الأصول تحتاج قيمة حالية.");return}
    if(!touched.length&&Object.keys(baseline).length===0){setError("لا توجد بيانات للحفظ.");return}
    setSaving(true);
    try{
      const payload=touched.map(r=>{const q=num(r.quantity);const avg=num(r.averageCost);const mv=rowValue(r);return{id:r.holdingId??null,name:r.name.trim(),symbol:r.symbol.trim()||null,asset_type:assetType(r.type),quantity:q>0?q:null,average_cost:avg>0?avg:null,cost_basis:q>0&&avg>0?q*avg:null,market_value:mv>0?mv:null,keep_market_price:isMarketManaged(r)}});
      const {data,error:rpcError}=await browserSupabase.rpc("wealth_reconcile_awaed",{p_holdings:payload});
      if(rpcError)throw rpcError;
      const r=data as {added?:number;updated?:number;removed?:number;adjustments?:number};
      setResult({added:Number(r?.added??0),updated:Number(r?.updated??0),removed:Number(r?.removed??0),adjustments:Number(r?.adjustments??0)});
      setSaved(true); await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"تعذر مطابقة محفظة عوائد.")}finally{setSaving(false)}
  }

  if(loading)return <section className={styles.card}><div className={styles.loading}>جارٍ تحميل محفظة عوائد الحالية…</div></section>;
  if(!email)return <section className={styles.card}><div className={styles.heading}><span>المطابقة الآمنة</span><h2>سجّل الدخول لعرض محفظة عوائد الحالية.</h2><p>نحتاج تسجيل الدخول أولًا حتى نحمّل الأصول الموجودة ونمنع استبدالها أو حذفها بالخطأ.</p></div><Link className={styles.primary} href="/wealth/login?next=%2Fwealth%2Fconnect%2Fawaed">تسجيل الدخول</Link></section>;

  return <section className={styles.card}>
    <div className={styles.accountBar}><div><span>الحساب الجاري تحديثه</span><strong>محفظة عوائد · {email}</strong></div><span className={styles.connected}>محفظة حقيقية</span></div>
    <div className={styles.heading}><span>مطابقة كاملة</span><h2>حدّث الكمية أو التكلفة فقط.</h2><p>الأسهم والـREIT ذات الرمز السوقي تحتفظ بالسعر السوقي التلقائي. حذف صف يعني أن الأصل لم يعد موجودًا في عوائد.</p></div>
    <div className={styles.tableWrap}>
      <div className={styles.headerRow}><span>الاستثمار</span><span>النوع</span><span>الرمز</span><span>الكمية</span><span>متوسط التكلفة</span><span>القيمة الحالية</span><span></span></div>
      <div className={styles.rows}>{rows.map(row=>{
        const managed=isMarketManaged(row);const display=rowValue(row);
        return <div className={styles.row} key={row.key}>
          <label className={styles.nameField}><span className={styles.mobileLabel}>الاستثمار</span><input value={row.name} onChange={e=>patch(row.key,{name:e.target.value})} placeholder="اسم الاستثمار" /></label>
          <label><span className={styles.mobileLabel}>النوع</span><select value={row.type} onChange={e=>patch(row.key,{type:e.target.value as AssetKind})}>{kinds.map(k=><option key={k}>{k}</option>)}</select></label>
          <label><span className={styles.mobileLabel}>الرمز</span><input value={row.symbol} onChange={e=>patch(row.key,{symbol:e.target.value})} placeholder="2222" dir="ltr" /></label>
          <label><span className={styles.mobileLabel}>الكمية</span><input value={row.quantity} onChange={e=>numberPatch(row.key,"quantity",e.target.value)} inputMode="decimal" dir="ltr" placeholder="0" /></label>
          <label><span className={styles.mobileLabel}>متوسط التكلفة</span><div className={styles.moneyInput}><input value={row.averageCost} onChange={e=>numberPatch(row.key,"averageCost",e.target.value)} inputMode="decimal" dir="ltr" placeholder="0"/><small>ر.س</small></div></label>
          <label><span className={styles.mobileLabel}>القيمة الحالية</span>{managed?<div className={styles.autoValue}><strong>{sar(display)}</strong><small>تلقائي</small></div>:<div className={styles.moneyInput}><input value={row.currentValue} onChange={e=>numberPatch(row.key,"currentValue",e.target.value)} inputMode="decimal" dir="ltr" placeholder="0"/><small>ر.س</small></div>}</label>
          <button className={styles.remove} type="button" onClick={()=>remove(row.key)} aria-label="حذف الأصل">×</button>
        </div>})}</div>
    </div>
    <button className={styles.addRow} type="button" onClick={add}>+ إضافة أصل</button>
    <div className={styles.summary}><div><span>التغييرات</span><strong>{changes.total}</strong><small>{changes.added} جديد · {changes.changed} معدل · {changes.removed} محذوف</small></div><div className={styles.totalBox}><span>قيمة عوائد الحالية</span><strong>{sar(total)} ر.س</strong><small>الأسعار السوقية تتحدث تلقائيًا حيثما أمكن</small></div><div><span>التكلفة المسجلة</span><strong>{cost>0?`${sar(cost)} ر.س`:"—"}</strong><small>من الكمية × متوسط التكلفة</small></div></div>
    {changes.removed>0&&<div className={styles.warning}>سيتم حذف {changes.removed} أصل من محفظة عوائد الحالية وتسجيل خروجه كتعديل مركز.</div>}
    {error&&<div className={styles.error}>{error}</div>}
    {saved&&<div className={styles.saved}><span>تمت مطابقة محفظة عوائد بأمان{result?` · ${result.adjustments} تغيّر في المراكز مسجل`:""}.</span><Link href="/wealth/assets">عرض الأصول</Link></div>}
    <div className={styles.footer}><p>الحفظ يمثل لقطة كاملة لمحفظة عوائد الحالية. تغيّر الكمية يُسجل كتعديل مركز وليس كصفقة مؤكدة، لأن عوائد لا يرسل لنا سجل تنفيذ رسمي.</p><button className={styles.primary} type="button" onClick={save} disabled={saving||invalid.length>0}>{saving?"جارٍ المطابقة…":"حفظ ومطابقة"}</button></div>
  </section>;
}
