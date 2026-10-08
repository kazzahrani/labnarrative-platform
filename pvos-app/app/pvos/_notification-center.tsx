"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {pvosSupabase} from "./_pvos-supabase";
import styles from "./pvos.module.css";

type NotificationItem={
 id:string;kind:string;title:string;description:string;
 target_path:string;created_at:string;read_at:string|null;unread:boolean;
};
type Feed={items:NotificationItem[];unread_count:number;total:number};
const timeLabel=(v:string)=>new Intl.DateTimeFormat("en-GB",{
 timeZone:"Asia/Riyadh",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"
}).format(new Date(v));

export function NotificationCenter({userId}:{userId:string}){
 const router=useRouter();
 const root=useRef<HTMLDivElement>(null);
 const [feed,setFeed]=useState<Feed>({items:[],unread_count:0,total:0});
 const [open,setOpen]=useState(false);
 const [loading,setLoading]=useState(false);
 const [updating,setUpdating]=useState(false);
 const [error,setError]=useState("");

 const refresh=useCallback(async()=>{
  const {data,error:fetchError}=await pvosSupabase.rpc("pvos_notification_feed",{p_limit:40});
  if(fetchError)throw fetchError;
  const next=data as Feed|null;
  if(next)setFeed({items:next.items||[],unread_count:next.unread_count||0,total:next.total||0});
 },[]);
 useEffect(()=>{
  let active=true;
  setFeed({items:[],unread_count:0,total:0});setOpen(false);setError("");
  const poll=()=>{if(active&&document.visibilityState==="visible")refresh().catch(()=>{if(active)setError("Could not refresh notifications");});};
  poll();
  const timer=window.setInterval(poll,30000);
  const onFocus=()=>poll();
  const onVisibility=()=>{if(document.visibilityState==="visible")poll();};
  const onChanged=()=>poll();
  window.addEventListener("focus",onFocus);
  document.addEventListener("visibilitychange",onVisibility);
  window.addEventListener("pvos-notifications-changed",onChanged);
  return ()=>{active=false;window.clearInterval(timer);window.removeEventListener("focus",onFocus);document.removeEventListener("visibilitychange",onVisibility);window.removeEventListener("pvos-notifications-changed",onChanged);};
 },[userId,refresh]);
 useEffect(()=>{
  if(!open)return;
  const onPointer=(e:PointerEvent)=>{if(root.current&&!root.current.contains(e.target as Node))setOpen(false);};
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false);};
  document.addEventListener("pointerdown",onPointer);
  document.addEventListener("keydown",onKey);
  return ()=>{document.removeEventListener("pointerdown",onPointer);document.removeEventListener("keydown",onKey);};
 },[open]);

 async function toggle(){
  if(open){setOpen(false);return;}
  setOpen(true);setLoading(true);setError("");
  try{await refresh();}catch{setError("Could not load notifications");}
  finally{setLoading(false);}
 }
 async function markAll(){
  if(updating||feed.unread_count===0)return;
  setUpdating(true);setError("");
  try{
   const {error:readError}=await pvosSupabase.rpc("pvos_notification_mark_read",{p_key:null,p_all:true});
   if(readError)throw readError;
   await refresh();
  }catch{setError("Could not mark notifications as read");}
  finally{setUpdating(false);}
 }
 async function select(item:NotificationItem){
  if(updating)return;
  setUpdating(true);setError("");
  try{
   if(item.unread){
    const {error:readError}=await pvosSupabase.rpc("pvos_notification_mark_read",{p_key:item.id,p_all:false});
    if(readError)throw readError;
   }
   setOpen(false);
   if(item.target_path.startsWith("/pvos/")&&!item.target_path.startsWith("//")){
    router.push(item.target_path);
   }
   void refresh().catch(()=>{});
  }catch{
   setError("Could not open notification. Please try again.");
  }finally{setUpdating(false);}
 }
 return <div className={styles.notificationRoot} ref={root}>
  <button type="button" className={styles.notificationBell} onClick={()=>{void toggle();}}
   aria-expanded={open} aria-haspopup="dialog" aria-label={"Notifications"+(feed.unread_count?", "+feed.unread_count+" unread":"")}
   title="Notifications">
   <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>
   </svg>
   {feed.unread_count>0?<span className={styles.notificationCount}>{feed.unread_count>99?"99+":feed.unread_count}</span>:null}
  </button>
  {open?<section className={styles.notificationPanel} role="dialog" aria-label="Notifications">
   <div className={styles.notificationPanelHeader}>
    <div><strong>Notifications</strong><span>{feed.unread_count} unread</span></div>
    <button type="button" disabled={updating||feed.unread_count===0} onClick={()=>{void markAll();}}>Mark all read</button>
   </div>
   {error?<p className={styles.notificationError} role="alert">{error}</p>:null}
   <div className={styles.notificationList}>
    {loading?<div className={styles.notificationEmpty}>Loading...</div>:
     feed.items.length?feed.items.map(item=><button type="button" key={item.id} className={styles.notificationItem}
      data-unread={item.unread?"true":"false"} onClick={()=>{void select(item);}}>
      <span className={styles.notificationItemTop}>
       <strong>{item.title}</strong>
       {item.unread?<span className={styles.notificationUnreadDot} aria-label="Unread"/>:null}
      </span>
      <span className={styles.notificationItemDesc}>{item.description}</span>
      <span className={styles.notificationItemMeta}>{item.kind==="invoice"?"Invoice":"Task"} · {timeLabel(item.created_at)}</span>
     </button>):
     <div className={styles.notificationEmpty}>No notifications yet. You'll see invoice handoffs and task reviews here.</div>}
   </div>
   {feed.total>feed.items.length?<div className={styles.notificationPanelFooter}>Showing the {feed.items.length} most recent notifications</div>:null}
  </section>:null}
 </div>;
}
