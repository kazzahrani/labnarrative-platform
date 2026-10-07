"use client";
import { registrationStatuses } from "../_registration";
import styles from "../pvos.module.css";

export type RegistrationDraft={status:string,number:string,reference:string};
export const emptyRegistration:RegistrationDraft={status:"Not recorded",number:"",reference:""};

export function RegistrationFields({value,onChange}:{value:RegistrationDraft,onChange:(value:RegistrationDraft)=>void}){
  const options=registrationStatuses.includes(value.status)?registrationStatuses:[value.status,...registrationStatuses];
  return <>
    <label>Registration status<select className={styles.input} value={value.status} onChange={e=>onChange({...value,status:e.target.value})}>{options.map(s=><option key={s}>{s}</option>)}</select></label>
    <label>SFDA registration number<input className={styles.input} value={value.number} onChange={e=>onChange({...value,number:e.target.value})} maxLength={200}/></label>
    <label>Registration reference<input className={styles.input} value={value.reference} onChange={e=>onChange({...value,reference:e.target.value})} placeholder="Document name, record reference or URL" maxLength={2000}/></label>
  </>;
}
