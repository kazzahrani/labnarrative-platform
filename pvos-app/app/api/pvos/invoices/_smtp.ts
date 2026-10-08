import {connect as tcpConnect, type Socket} from "node:net";
import {connect as tlsConnect, type TLSSocket} from "node:tls";
import {randomUUID} from "node:crypto";

// SMTP implementation for iCloud Mail with mandatory STARTTLS (port 587).
// No credentials or invoice content are logged. Mail is sent server-side only.
const HOST="smtp.mail.me.com";
const PORT=587;
const FROM_ADDRESS="hello@pvos.site";
type Reply={code:number;text:string};

class ReplyReader {
 private buffer="";
 private current:string[]=[];
 private queued:Reply[]=[];
 private waiting:((reply:Reply)=>void)|null=null;
 private failure:((error:Error)=>void)|null=null;
 private readonly onData=(chunk:Buffer)=>{
  this.buffer+=chunk.toString("utf8");
  if(this.buffer.length>65536){this.onError(new Error("SMTP reply exceeded safe size"));return;}
  while(true){
   const idx=this.buffer.indexOf("\r\n");
   if(idx<0)break;
   const line=this.buffer.slice(0,idx);
   this.buffer=this.buffer.slice(idx+2);
   this.current.push(line);
   if(/^\d{3} /.test(line)){
    const answer={code:Number(line.slice(0,3)),text:this.current.join("\n")};
    this.current=[];
    if(this.waiting){
     const resolve=this.waiting;this.waiting=null;this.failure=null;resolve(answer);
    }else this.queued.push(answer);
   }
  }
 };
 private readonly onError=(e:Error)=>{
  if(this.failure){const reject=this.failure;this.waiting=null;this.failure=null;reject(e);}
 };
 constructor(private socket:Socket|TLSSocket){
  socket.on("data",this.onData);socket.on("error",this.onError);
 }
 async read(expected:number[]):Promise<Reply>{
  const result=this.queued.length?this.queued.shift()!:await new Promise<Reply>((resolve,reject)=>{this.waiting=resolve;this.failure=reject;});
  if(!expected.includes(result.code))throw new Error("SMTP refused a command (code "+result.code+")");
  return result;
 }
 detach(){this.socket.off("data",this.onData);this.socket.off("error",this.onError);}
}

const emailPattern=/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
function lines64(s:string){
 const raw=Buffer.from(s,"utf8").toString("base64");
 return raw.match(/.{1,76}/g)?.join("\r\n")||"";
}
async function command(socket:Socket|TLSSocket,reader:ReplyReader,input:string,codes:number[]){
 socket.write(input+"\r\n");return reader.read(codes);
}
async function establishConnection():Promise<Socket>{
 const socket=tcpConnect({host:HOST,port:PORT});
 socket.setTimeout(20000,()=>socket.destroy(new Error("SMTP connection timed out")));
 await new Promise<void>((resolve,reject)=>{
  socket.once("connect",()=>{socket.off("error",reject);resolve();});
  socket.once("error",reject);
 });
 return socket;
}
export async function sendPvosSmtpMessage(args:{to:string;subject:string;body:string}):Promise<string>{
 const username=process.env.PVOS_SMTP_USER||"";
 const password=process.env.PVOS_SMTP_PASSWORD||"";
 if(!username||!password)throw new Error("SMTP credentials not configured");
 if(!emailPattern.test(username)||!emailPattern.test(args.to))throw new Error("Invalid SMTP email address");
 let connection:Socket|TLSSocket|undefined;
 try{
  const plain=await establishConnection();
  connection=plain;
  const plainReader=new ReplyReader(plain);
  await plainReader.read([220]);
  await command(plain,plainReader,"EHLO pvos.site",[250]);
  await command(plain,plainReader,"STARTTLS",[220]);
  plainReader.detach();
  const secure=tlsConnect({socket:plain,servername:HOST,rejectUnauthorized:true,minVersion:"TLSv1.2"});
  connection=secure;
  await new Promise<void>((resolve,reject)=>{
   secure.once("secureConnect",()=>{secure.off("error",reject);resolve();});
   secure.once("error",reject);
  });
  if(!secure.authorized)throw new Error("SMTP TLS certificate not trusted");
  const reader=new ReplyReader(secure);
  await command(secure,reader,"EHLO pvos.site",[250]);
  await command(secure,reader,"AUTH LOGIN",[334]);
  await command(secure,reader,Buffer.from(username,"utf8").toString("base64"),[334]);
  await command(secure,reader,Buffer.from(password,"utf8").toString("base64"),[235]);
  await command(secure,reader,"MAIL FROM:<"+FROM_ADDRESS+">",[250]);
  await command(secure,reader,"RCPT TO:<"+args.to+">",[250,251]);
  await command(secure,reader,"DATA",[354]);
  const id=randomUUID();
  const subject="=?UTF-8?B?"+Buffer.from(args.subject,"utf8").toString("base64")+"?=";
  const headers=[
   "Date: "+new Date().toUTCString(),
   "From: PVOS <"+FROM_ADDRESS+">",
   "To: <"+args.to+">",
   "Subject: "+subject,
   "Message-ID: <"+id+"@pvos.site>",
   "MIME-Version: 1.0",
   "Content-Type: text/plain; charset=UTF-8",
   "Content-Transfer-Encoding: base64",
   "Auto-Submitted: auto-generated",
   "X-Auto-Response-Suppress: All"
  ];
  secure.write(headers.join("\r\n")+"\r\n\r\n"+lines64(args.body)+"\r\n.\r\n");
  await reader.read([250]);
  try{await command(secure,reader,"QUIT",[221]);}catch{/* Already accepted; no resend on QUIT failure. */}
  return id;
 }finally{
  connection?.destroy();
 }
}
