"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import { formatWealthMoney, fromSar, toSar, type WealthCurrency, USD_SAR } from "../../wealth-money";
import styles from "./manual-awaed.module.css";

type AssetKind = "سهم" | "صندوق" | "مرابحة" | "صك" | "ريت" | "نقد" | "أخرى";
type Row = {
  key:string; holdingId?:string; name:string; type:AssetKind; symbol:string;
  currency:WealthCurrency; quantity:string; averageCost:string; currentValue:string; unitPriceSar:number|null;
};
type Baseline = Record<string,{name:string;type:AssetKind;symbol:string;currency:WealthCurrency;quantity:number;averageCost:number}>;

const kinds:AssetKind[]=["سهم","ريت","صندوق","مرابحة","صك","نقد","أخرى"];
const eastern="٠١٢٣٤٥٦٧٨٩",persian="۰۱۲۳۴۵۶۷۸۹";
function normalizeNumber(input:string){let v=input.replace(/[٠-٩]/g,d=>String(eastern.indexOf(d))).replace(/[۰-۹]/g,d=>String(persian.indexOf(d))).replace(/٫/g,".").replace(/[٬,\s\u200e\u200f\u202a-\u202e]/g,"").replace(/[^0-9.\-]/g,"");const neg=v.startsWith("-");v=v.replace(/-/g,"");const[w="",...d]=v.split(".");return`${neg?"-":""}${d.length?`${w}.${d.join("")}`:w}`}
function num(v:string){const n=Number(normalizeNumber(v));return Number.isFinite(n)?n:0}
function kindFrom(type:string):AssetKind{if(type==="saudi_stock"||type==="global_stock")return"سهم";if(type==="reit")return"ريت";if(type==="fund"||type==="etf")return"صندوق";if(type==="murabaha")return"مرابحة";if(type==="sukuk")return"صك";if(type==="cash")return"نقد";return"أخرى"}
function assetType(type:AssetKind,currency:WealthCurrency){if(type==="سهم")return currency==="USD"?"global_stock":"saudi_stock";if(type==="ريت")return currency==="USD"?"global_stock":"reit";if(type==="صندوق")return"fund";if(type==="مرابحة")return"murabaha";if(type==="صك")return"sukuk";if(type==="نقد")return"cash";return"other"}
function blank(key:string):Row{return{key,name:"",type:"صندوق",symbol:"",currency:"SAR",quantity:"",averageCost:"",currentValue:"",unitPriceSar:null}}
function isMarketManaged(r:Row){return r.currency==="SAR"&&(r.type==="سهم"||r.type==="ريت")&&r.symbol.trim().length>0&&r.unitPriceSar!==null&&r.unitPriceSar>0}
function rowValueOriginal(r:Row){const q=num(r.quantity);if(isMarketManaged(r)&&q>0)return fromSar((r.unitPriceSar as number)*q,r.currency);return num(r.currentValue)}
function rowValueSar(r:Row){return toSar(rowValueOriginal(r),r.currency)}

export default function ManualAwaedClientV4(){
  const seq=useRef(1);const[rows,setRows]=useState<Row[]>([]);const[baseline,setBaseline]=useState<Baseline>({});
  const[email,setEmail]=useState("");const[baseCurrency,setBaseCurrency]=useState<WealthCurrency>("SAR");
  const[loading,setLoading]=useState(true);const[saving,setSaving]=useState(false);const[saved,setSaved]=useState(false);const[error,setError]=useState("");
  const[result,setResult]=useState<{added:number;updated:number;removed:number;adjustments:number}|null>(null);

  async function load(){setLoading(true);setError("");const{data:sessionData,error:sessionError}=await browserSupabase.auth.getSession();if(sessionError){setError(sessionError.message);setLoading(false);return}const session=sessionData.session;if(!session){setRows([]);setLoading(false);return}setEmail(session.user.email??"");
    const[{data:profile},{data:account,error:accountError}]=await Promise.all([
      browserSupabase.from("wealth_profiles").select("base_currency").eq("user_id",session.user.id).maybeSingle(),
      browserSupabase.from("wealth_accounts").select("id").eq("user_id",session.user.id).eq("provider","Awaed").eq("portfolio_kind","real").neq("status","archived").order("created_at",{ascending:true}).limit(1).maybeSingle()
    ]);setBaseCurrency(profile?.base_currency==="USD"?"USD":"SAR");if(accountError){setError(accountError.message);setLoading(false);return}if(!account){setRows([blank(`new-${seq.current++}`)]);setBaseline({});setLoading(false);return}
    const{data:holdings,error:hError}=await browserSupabase.from("wealth_holdings").select("id,asset_name,symbol,asset_type,quantity,unit_price,market_value,cost_basis,metadata").eq("user_id",session.user.id).eq("account_id",account.id).eq("portfolio_kind","real").order("created_at",{ascending:true});if(hError){setError(hError.message);setLoading(false);return}
    const next=(holdings??[]).map(h=>{const meta=(h.metadata??{}) as Record<string,unknown>;const currency:WealthCurrency=meta.original_currency==="USD"?"USD":"SAR";const fx=currency==="USD"?USD_SAR:1;const q=Number(h.quantity??0);const cb=Number(h.cost_basis??0);const mv=h.market_value==null?0:Number(h.market_value);const originalMarket=Number(meta.original_market_value);const originalAvg=Number(meta.original_average_cost);return{key:String(h.id),holdingId:String(h.id),name:String(h.asset_name??""),type:kindFrom(String(h.asset_type??"other")),symbol:String(h.symbol??""),currency,quantity:q?String(q):"",averageCost:Number.isFinite(originalAvg)&&originalAvg>0?String(originalAvg):q>0&&cb>0?String(cb/q/fx):"",currentValue:Number.isFinite(originalMarket)&&originalMarket>0?String(originalMarket):mv>0?String(mv/fx):"",unitPriceSar:h.unit_price==null?null:Number(h.unit_price)} as Row});
    const base:Baseline={};for(const r of next)base[r.holdingId!]={name:r.name,type:r.type,symbol:r.symbol,currency:r.currency,quantity:num(r.quantity),averageCost:num(r.averageCost)};setRows(next.length?next:[blank(`new-${seq.current++}`)]);setBaseline(base);setLoading(false)}
  useEffect(()=>{void load()},[]);

  const touched=useMemo(()=>rows.filter(r=>r.name.trim()||r.symbol.trim()||r.quantity.trim()||r.averageCost.trim()||r.currentValue.trim()),[rows]);
  const invalid=useMemo(()=>touched.filter(r=>{if(!r.name.trim())return true;const q=num(r.quantity);if(isMarketManaged(r)&&q>0)return false;return rowValueOriginal(r)<=0}),[touched]);
  const totalSar=useMemo(()=>touched.reduce((s,r)=>s+Math.max(0,rowValueSar(r)),0),[touched]);
  const costSar=useMemo(()=>touched.reduce((s,r)=>{const q=num(r.quantity),a=num(r.averageCost);return s+(q>0&&a>0?toSar(q*a,r.currency):0)},0),[touched]);
  const changes=useMemo(()=>{let added=0,changed=0,removed=0;const live=new Set<string>();for(const r of touched){if(!r.holdingId){added++;continue}live.add(r.holdingId);const b=baseline[r.holdingId];if(!b)continue;if(b.name!==r.name.trim()||b.type!==r.type||b.symbol!==r.symbol.trim()||b.currency!==r.currency||Math.abs(b.quantity-num(r.quantity))>1e-8||Math.abs(b.averageCost-num(r.averageCost))>1e-6)changed++}for(const id of Object.keys(baseline))if(!live.has(id))removed++;return{added,changed,removed,total:added+changed+removed}},[touched,baseline]);

  function patch(key:string,p:Partial<Row>){setRows(cur=>cur.map(r=>r.key===key?{...r,...p}:r));setSaved(false);setResult(null);setError("")}
  function numberPatch(key:string,field:"quantity"|"averageCost"|"currentValue",value:string){patch(key,{[field]:normalizeNumber(value)} as Partial<Row>)}
  function add(){setRows(cur=>[...cur,blank(`new-${seq.current++}`)]);setSaved(false)}
  function remove(key:string){setRows(cur=>cur.filter(r=>r.key!==key));setSaved(false);setResult(null)}
  async function changeBaseCurrency(currency:WealthCurrency){setBaseCurrency(currency);const{data}=await browserSupabase.auth.getUser();if(data.user)await browserSupabase.from("wealth_profiles").upsert({user_id:data.user.id,base_currency:currency,updated_at:new Date().toISOString()},{onConflict:"user_id"})}

  async function save(){setError("");setSaved(false);setResult(null);if(invalid.length){setError("يوجد صف غير مكتمل. اختر العملة وأدخل البيانات كما تظهر في عوائد.");return}if(!touched.length&&Object.keys(baseline).length===0){setError("لا توجد بيانات للحفظ.");return}setSaving(true);try{const payload=touched.map(r=>{const q=num(r.quantity),avg=num(r.averageCost),mv=rowValueOriginal(r);return{id:r.holdingId??null,name:r.name.trim(),symbol:r.symbol.trim()||null,asset_type:assetType(r.type,r.currency),original_currency:r.currency,quantity:q>0?q:null,average_cost:avg>0?avg:null,market_value:mv>0?mv:null,keep_market_price:isMarketManaged(r)}});const{data,error:rpcError}=await browserSupabase.rpc("wealth_reconcile_awaed_v4",{p_holdings:payload,p_base_currency:baseCurrency});if(rpcError)throw rpcError;const r=data as{added?:number;updated?:number;removed?:number;adjustments?:number};setResult({added:Number(r?.added??0),updated:Number(r?.updated??0),removed:Number(r?.removed??0),adjustments:Number(r?.adjustments??0)});setSaved(true);await load()}catch(reason){setError(reason instanceof Error?reason.message:"تعذر مطابقة محفظة عوائد.")}finally{setSaving(false)}}

  if(loading)return<section className={styles.card}><div className={styles.loading}>جارٍ تحميل محفظة عوائد الحالية…</div></section>;
  if(!email)return<section className={styles.card}><div className={styles.heading}><span>المطابقة الآمنة</span><h2>سجّل الدخول لعرض محفظة عوائد الحالية.</h2></div><Link className={styles.primary} href="/wealth/login?next=%2Fwealth%2Fconnect%2Fawaed">تسجيل الدخول</Link></section>;

  return<section className={styles.card}>
    <div className={styles.accountBar}><div><span>الحساب الجاري تحديثه</span><strong>محفظة عوائد · {email}</strong></div><span className={styles.connected}>محفظة حقيقية</span></div>
    <div className={styles.currencyBar}><div><span>العملة الرئيسية للمنصة</span><small>لا تغيّر عملة الأصل؛ تغيّر فقط طريقة عرض ثروتك.</small></div><div className={styles.currencyToggle}><button type="button" className={baseCurrency==="SAR"?styles.currencyActive:""} onClick={()=>void changeBaseCurrency("SAR")}>ر.س</button><button type="button" className={baseCurrency==="USD"?styles.currencyActive:""} onClick={()=>void changeBaseCurrency("USD")}>$</button></div></div>
    <div className={styles.heading}><span>السوق السعودي + السوق الأمريكي</span><h2>أدخل كل أصل بعملته الأصلية.</h2><p>اختر ر.س للأصول السعودية و$ للأصول الأمريكية. ثروة تحفظ العملة الأصلية وتحول داخليًا بسعر 1 دولار = 3.75 ر.س.</p></div>
    <div className={styles.tableWrap}><div className={styles.headerRow}><span>الاستثمار</span><span>النوع</span><span>الرمز</span><span>العملة</span><span>الكمية</span><span>متوسط التكلفة</span><span>القيمة الحالية</span><span></span></div><div className={styles.rows}>{rows.map(row=>{const managed=isMarketManaged(row);const display=rowValueOriginal(row);const mark=row.currency==="USD"?"$":"ر.س";return<div className={styles.row} key={row.key}>
      <label className={styles.nameField}><span className={styles.mobileLabel}>الاستثمار</span><input value={row.name} onChange={e=>patch(row.key,{name:e.target.value})} placeholder="اسم الاستثمار"/></label>
      <label><span className={styles.mobileLabel}>النوع</span><select value={row.type} onChange={e=>patch(row.key,{type:e.target.value as AssetKind})}>{kinds.map(k=><option key={k}>{k}</option>)}</select></label>
      <label><span className={styles.mobileLabel}>الرمز</span><input value={row.symbol} onChange={e=>patch(row.key,{symbol:e.target.value})} placeholder={row.currency==="USD"?"AAPL":"2222"} dir="ltr"/></label>
      <label><span className={styles.mobileLabel}>العملة</span><select value={row.currency} onChange={e=>patch(row.key,{currency:e.target.value as WealthCurrency,unitPriceSar:e.target.value==="USD"?null:row.unitPriceSar})}><option value="SAR">ر.س</option><option value="USD">$</option></select></label>
      <label><span className={styles.mobileLabel}>الكمية</span><input value={row.quantity} onChange={e=>numberPatch(row.key,"quantity",e.target.value)} inputMode="decimal" dir="ltr" placeholder="0"/></label>
      <label><span className={styles.mobileLabel}>متوسط التكلفة</span><div className={styles.moneyInput}><input value={row.averageCost} onChange={e=>numberPatch(row.key,"averageCost",e.target.value)} inputMode="decimal" dir="ltr" placeholder="0"/><small>{mark}</small></div></label>
      <label><span className={styles.mobileLabel}>القيمة الحالية</span>{managed?<div className={styles.autoValue}><strong>{formatWealthMoney(toSar(display,row.currency),row.currency)}</strong><small>سعر سوق تلقائي</small></div>:<div className={styles.moneyInput}><input value={row.currentValue} onChange={e=>numberPatch(row.key,"currentValue",e.target.value)} inputMode="decimal" dir="ltr" placeholder="0"/><small>{mark}</small></div>}</label>
      <button className={styles.remove} type="button" onClick={()=>remove(row.key)} aria-label="حذف الأصل">×</button>
    </div>})}</div></div>
    <button className={styles.addRow} type="button" onClick={add}>+ إضافة أصل</button>
    <div className={styles.summary}><div><span>التغييرات</span><strong>{changes.total}</strong><small>{changes.added} جديد · {changes.changed} معدل · {changes.removed} محذوف</small></div><div className={styles.totalBox}><span>قيمة عوائد الحالية</span><strong>{formatWealthMoney(totalSar,baseCurrency)}</strong><small>تحويل موحد للعرض بالعملة الرئيسية</small></div><div><span>التكلفة المسجلة</span><strong>{costSar>0?formatWealthMoney(costSar,baseCurrency):"—"}</strong><small>مع الاحتفاظ بعملة الإدخال الأصلية</small></div></div>
    {changes.removed>0&&<div className={styles.warning}>سيتم حذف {changes.removed} أصل من محفظة عوائد الحالية وتسجيل خروجه كتعديل مركز.</div>}{error&&<div className={styles.error}>{error}</div>}{saved&&<div className={styles.saved}><span>تمت مطابقة محفظة عوائد بأمان{result?` · ${result.adjustments} تغيّر في المراكز مسجل`:""}.</span><Link href="/wealth/assets">عرض الأصول</Link></div>}
    <div className={styles.footer}><p>القيم تُخزن داخليًا بالريال للحساب الموحد، مع حفظ القيمة والعملة الأصلية لكل أصل. تغيير العملة الرئيسية لا يغيّر بيانات الاستثمار.</p><button className={styles.primary} type="button" onClick={save} disabled={saving||invalid.length>0}>{saving?"جارٍ المطابقة…":"حفظ ومطابقة"}</button></div>
  </section>;
}
