import {createClient,type SupabaseClient,type User} from "@supabase/supabase-js";

export class AdminApiError extends Error{status:number;constructor(message:string,status:number){super(message);this.status=status;}}

export async function requireAdminApi(request:Request):Promise<{db:SupabaseClient;user:User;token:string}>{
 const header=request.headers.get("authorization")||"";
 const token=header.toLowerCase().startsWith("bearer ")?header.slice(7).trim():"";
 if(!token)throw new AdminApiError("Sign in to access the admin workspace.",401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new AdminApiError("Supabase public configuration is missing.",500);
 const db=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const{data:userData,error:userError}=await db.auth.getUser(token);
 if(userError||!userData.user)throw new AdminApiError("Your admin session is no longer valid.",401);
 const{data:allowed,error:allowedError}=await db.rpc("is_internal_admin");
 if(allowedError)throw allowedError;
 if(allowed!==true)throw new AdminApiError("This account is not authorized for the LabNarrative Control Center.",403);
 return{db,user:userData.user,token};
}
export function adminApiError(error:unknown){
 if(error instanceof AdminApiError)return Response.json({error:error.message},{status:error.status});
 const message=error instanceof Error?error.message:"Admin request failed.";
 console.error("admin api",error);
 return Response.json({error:message},{status:500});
}
