import type { PublicLeagueBot } from "@/lib/video-studio-league";
import { leagueAge, leagueDrawdown, leaguePct } from "@/lib/video-studio-league";

export type VideoStudioLanguage = "en" | "ar";
export type VideoStudioType = "performance_story" | "strategy_explainer" | "educational";

export const VIDEO_STUDIO_VOICES = {
  en: {
    male: "en-US-GuyNeural",
    female: "en-US-JennyNeural",
  },
  ar: {
    male: "ar-SA-HamedNeural",
    female: "ar-SA-ZariyahNeural",
  },
} as const;

export function videoWorkerConfig() {
  const raw = String(process.env.MPT_WORKER_URL || "").trim();
  const apiKey = String(process.env.MPT_WORKER_API_KEY || "").trim();
  if (!raw) return { configured: false as const, baseUrl: "", apiKey };
  try {
    const parsed = new URL(raw);
    return {
      configured: true as const,
      baseUrl: parsed.toString().replace(/\/$/, ""),
      apiKey,
    };
  } catch {
    return { configured: false as const, baseUrl: "", apiKey };
  }
}

function pct(value: number | null) {
  return leaguePct(value);
}

function benchmarkSentence(bot: PublicLeagueBot, language: VideoStudioLanguage) {
  if (!bot.benchmark) return "";
  if (language === "ar") {
    return `وخلال نفس الفترة، أداء بتكوين كان ${pct(bot.benchmark.returnPct)}.`;
  }
  return `Over the same period, Bitcoin returned ${pct(bot.benchmark.returnPct)}.`;
}

function performanceCopy(bot: PublicLeagueBot, language: VideoStudioLanguage, seconds: number) {
  const maturity = `${leagueAge(bot.ageDays)} · ${bot.closedTrades} closed trades`;
  if (language === "ar") {
    const compact = seconds <= 20;
    const script = compact
      ? `هذا بوت ${bot.name} في دوري LabNarrative للتداول التجريبي. إلى الآن حقق عائد ${pct(bot.totalReturn)}، بأقصى تراجع ${leagueDrawdown(bot.maxDrawdown)}، بعد ${bot.closedTrades} صفقة مغلقة خلال ${leagueAge(bot.ageDays)}. هذه نتائج تداول تجريبي وليست توصية استثمارية.`
      : `إذا شفت بوت رابح، لا تناظر العائد لحاله. هذا ${bot.name} في دوري LabNarrative للتداول التجريبي. عمر التجربة ${leagueAge(bot.ageDays)} وعنده ${bot.closedTrades} صفقة مغلقة. العائد الحالي ${pct(bot.totalReturn)}، ونسبة الصفقات الرابحة ${pct(bot.winRate)}، وأقصى تراجع ${leagueDrawdown(bot.maxDrawdown)}. ${benchmarkSentence(bot, "ar")} الفكرة هنا مو إننا نقول لك اشتر أو بع. الفكرة إنك تشوف الأداء الحقيقي قدامك، مع المدة، الصفقات والتراجع. هذه نتائج تداول تجريبي وليست توصية استثمارية.`;
    return {
      subject: `أداء بوت ${bot.name} في LabNarrative`,
      script,
      caption: `${bot.name} · ${maturity} · العائد ${pct(bot.totalReturn)} · أقصى تراجع ${leagueDrawdown(bot.maxDrawdown)}. تجربة تداول تجريبي عامة على LabNarrative. ليست توصية استثمارية.`,
    };
  }

  const compact = seconds <= 20;
  const script = compact
    ? `This is ${bot.name} in the LabNarrative public Paper Trading Bot League. So far it has returned ${pct(bot.totalReturn)}, with a maximum drawdown of ${leagueDrawdown(bot.maxDrawdown)}, across ${bot.closedTrades} closed trades over ${leagueAge(bot.ageDays)}. Paper-trading results only, not investment advice.`
    : `A bot's return is only one part of the story. This is ${bot.name} in the LabNarrative public Paper Trading Bot League. The experiment has been running for ${leagueAge(bot.ageDays)} with ${bot.closedTrades} closed trades. Its current return is ${pct(bot.totalReturn)}, win rate is ${pct(bot.winRate)}, and maximum drawdown is ${leagueDrawdown(bot.maxDrawdown)}. ${benchmarkSentence(bot, "en")} The point is not to tell you what to buy. It is to make the forward-test visible: age, trades, return, drawdown and benchmark, all in one place. Paper-trading results only, not investment advice.`;

  return {
    subject: `${bot.name} performance in the LabNarrative Bot League`,
    script,
    caption: `${bot.name} · ${maturity} · Return ${pct(bot.totalReturn)} · Max DD ${leagueDrawdown(bot.maxDrawdown)}. Public Paper-trading experiment on LabNarrative. Not investment advice.`,
  };
}

function strategyCopy(bot: PublicLeagueBot, language: VideoStudioLanguage, seconds: number) {
  if (language === "ar") {
    return {
      subject: `كيف نقرأ بوت ${bot.name}`,
      script: `وش أهم شيء قبل ما تحكم على بوت تداول؟ مو العائد فقط. خلنا نأخذ ${bot.name} كمثال. التجربة شغالة من ${leagueAge(bot.ageDays)}، وعندها ${bot.closedTrades} صفقة مغلقة، وعائد ${pct(bot.totalReturn)}، وأقصى تراجع ${leagueDrawdown(bot.maxDrawdown)}. كل ما زاد عمر التجربة وعدد الصفقات، صار عندك سياق أفضل للحكم على السلوك. في LabNarrative نخلي هذه الأرقام ظاهرة بدل ما نعرض لك باك تست جميل وخلاص. تداول تجريبي، وليس توصية استثمارية.`,
      caption: `قراءة ${bot.name}: المدة + الصفقات + العائد + التراجع. ${seconds}s explainer من LabNarrative. تداول تجريبي فقط.`,
    };
  }
  return {
    subject: `How to read ${bot.name}`,
    script: `What matters before judging a trading bot? Not return alone. Take ${bot.name}. The public experiment has run for ${leagueAge(bot.ageDays)}, with ${bot.closedTrades} closed trades, a return of ${pct(bot.totalReturn)}, and a maximum drawdown of ${leagueDrawdown(bot.maxDrawdown)}. More time and more trades give you more context about how the strategy behaves. LabNarrative keeps those forward-test metrics visible instead of stopping at a polished backtest. Paper trading only, not investment advice.`,
    caption: `How to read ${bot.name}: age + trades + return + drawdown. ${seconds}s LabNarrative explainer. Paper trading only.`,
  };
}

function educationalCopy(bot: PublicLeagueBot, language: VideoStudioLanguage) {
  if (language === "ar") {
    return {
      subject: "ليش العائد لوحده ما يكفي؟",
      script: `بوت ممكن يكون عائده عالي ومع ذلك ما عندك بيانات كفاية للحكم عليه. شوف ${bot.name}: عمر التجربة ${leagueAge(bot.ageDays)}، وعدد الصفقات المغلقة ${bot.closedTrades}، وأقصى تراجع ${leagueDrawdown(bot.maxDrawdown)}. هذه الأرقام تعطيك سياق ما يعطيك إياه رقم العائد لوحده. عشان كذا دوري LabNarrative يعرض المدة والصفقات والتراجع والمرجع جنب العائد. الهدف اختبار علني أوضح، مو توقع المستقبل. تداول تجريبي فقط.`,
      caption: "العائد بدون مدة، عدد صفقات وتراجع ما يعطي الصورة كاملة. مثال حي من دوري LabNarrative للتداول التجريبي.",
    };
  }
  return {
    subject: "Why return alone is not enough",
    script: `A trading bot can show a high return and still give you too little evidence to judge it. Look at ${bot.name}: the experiment is ${leagueAge(bot.ageDays)} old, has ${bot.closedTrades} closed trades, and a maximum drawdown of ${leagueDrawdown(bot.maxDrawdown)}. Those numbers provide context that return alone cannot. That is why the LabNarrative Bot League puts age, trades, drawdown and benchmarks beside performance. The goal is a clearer public forward test, not a prediction of future returns. Paper trading only.`,
    caption: "Return without age, trade count and drawdown is an incomplete picture. A live Paper Bot League example from LabNarrative.",
  };
}

export function buildVideoStudioCopy(
  bot: PublicLeagueBot,
  language: VideoStudioLanguage,
  seconds: number,
  type: VideoStudioType,
) {
  if (type === "strategy_explainer") return strategyCopy(bot, language, seconds);
  if (type === "educational") return educationalCopy(bot, language);
  return performanceCopy(bot, language, seconds);
}


function bridgeConfig(){
 const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!base||!key)throw new Error("Supabase public configuration is missing.");
 return{url:`${base}/functions/v1/internal-video-renderer`,key};
}
async function bridge(token:string,body:Record<string,unknown>){
 const config=bridgeConfig();
 const response=await fetch(config.url,{method:"POST",headers:{apikey:config.key,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(60_000)});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok||payload?.ok===false)throw new Error(String(payload?.message||payload?.error||`Video renderer bridge failed (${response.status}).`));
 return payload;
}
export async function videoRendererConfigured(token:string){
 try{const payload=await bridge(token,{action:"config"});return Boolean(payload?.configured)}catch{return false}
}
export async function submitVideoWorkerJob(token:string,input:{subject:string;script:string;language:VideoStudioLanguage;voiceName:string;}){
 const payload=await bridge(token,{action:"submit",...input});
 const taskId=String(payload?.taskId||"");
 if(!taskId)throw new Error("Renderer did not return a task id.");
 return{taskId,raw:{taskId}};
}
export async function pollVideoWorkerJob(token:string,taskId:string){
 const payload=await bridge(token,{action:"status",taskId});
 return{
  state:Number(payload?.state??0),
  progress:Math.max(0,Math.min(100,Number(payload?.progress||0))),
  outputUrl:String(payload?.outputUrl||""),
  error:String(payload?.error||""),
  failedStage:String(payload?.failedStage||""),
  raw:{state:payload?.state,progress:payload?.progress,outputUrl:payload?.outputUrl||null}
 };
}
export async function fetchVideoWorkerMedia(token:string,outputUrl:string){
 const config=bridgeConfig();
 return fetch(config.url,{method:"POST",headers:{apikey:config.key,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({action:"media",outputUrl}),cache:"no-store",signal:AbortSignal.timeout(60_000)});
}
