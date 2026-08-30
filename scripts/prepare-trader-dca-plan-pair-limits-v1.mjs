import fs from "node:fs";

const file = "app/trader/DcaBotConfigurator.tsx";
let source = fs.readFileSync(file, "utf8");

if (source.includes("// DCA_PLAN_PAIR_LIMITS_V1")) {
  console.log("DCA plan pair limits already prepared.");
  process.exit(0);
}

function replaceOnce(before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`DCA plan pair limits transform could not find ${label}.`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'type PairInfo = { pair:string; symbol:string; baseAsset:string };',
  `type PairInfo = { pair:string; symbol:string; baseAsset:string };\ntype EntitlementSnapshot = {\n  ok?: boolean;\n  plan: string;\n  limits: { multiPairBots: number };\n  remaining: { multiPairBots: number };\n};\n// DCA_PLAN_PAIR_LIMITS_V1`,
  "PairInfo type",
);

replaceOnce(
  '  const [localError,setLocalError]=useState("");',
  `  const [localError,setLocalError]=useState("");\n  const [entitlements,setEntitlements]=useState<EntitlementSnapshot|null>(null);\n  const [initialMultiPair,setInitialMultiPair]=useState(false);`,
  "local error state",
);

const pairLoadEffect = '  useEffect(()=>{let alive=true;void fetch("/api/trader/binance-pairs",{cache:"no-store"}).then(r=>r.json()).then((data:{pairs?:PairInfo[]})=>{if(alive&&data.pairs?.length)setPairs(data.pairs);}).catch(()=>{});return()=>{alive=false};},[]);';
replaceOnce(
  pairLoadEffect,
  `${pairLoadEffect}\n  useEffect(()=>{\n    let alive=true;\n    void browserSupabase.functions.invoke("trader-entitlements-control",{body:{}}).then(({data,error})=>{\n      if(!alive||error||!data)return;\n      const snapshot=data as EntitlementSnapshot;\n      if(snapshot.ok===true)setEntitlements(snapshot);\n    }).catch(()=>{});\n    return()=>{alive=false};\n  },[accountId]);`,
  "pair loading effect",
);

replaceOnce(
  'if(mode==="create"||!botId){setForm({...NEW_FORM,pairs:["BTC/USDT"]});setLoading(false);return()=>{alive=false};}',
  'if(mode==="create"||!botId){setInitialMultiPair(false);setForm({...NEW_FORM,pairs:["BTC/USDT"]});setLoading(false);return()=>{alive=false};}',
  "create-mode reset",
);

replaceOnce(
  'const bot=result.bot;setForm(',
  'const bot=result.bot;setInitialMultiPair(bot.allPairs||(bot.pairs?.length??0)>1);setForm(',
  "bot detail hydration",
);

replaceOnce(
  '  const plannedPerTrade=capital(form);',
  `  const plannedPerTrade=capital(form);\n  const multiPairBlockedReason=useMemo(()=>{\n    if(!entitlements||initialMultiPair)return "";\n    const maxMulti=Number(entitlements.limits?.multiPairBots??0);\n    const remainingMulti=Number(entitlements.remaining?.multiPairBots??0);\n    const plan=String(entitlements.plan||"free");\n    const planLabel=plan.charAt(0).toUpperCase()+plan.slice(1);\n    if(maxMulti<=0){\n      return plan==="starter"\n        ? "Starter supports one pair per DCA bot. Multi-pair DCA is available on Growth and Pro."\n        : "Multi-pair DCA is available on Growth and Pro.";\n    }\n    if(remainingMulti<=0)return \`Your \${planLabel} plan's multi-pair DCA bot limit is already in use.\`;\n    return "";\n  },[entitlements,initialMultiPair]);\n  const wantsMultiPair=form.allPairs||form.pairs.length>1;`,
  "planned capital calculation",
);

replaceOnce(
  '  const togglePair=(pair:string)=>setForm(value=>{const exists=value.pairs.includes(pair);const next=exists?value.pairs.filter(item=>item!==pair):[...value.pairs,pair];return{...value,pairs:next,pair:next[0]||value.pair};});',
  `  const togglePair=(pair:string)=>{\n    const exists=form.pairs.includes(pair);\n    if(!exists&&form.pairs.length>=1&&multiPairBlockedReason){setLocalError(multiPairBlockedReason);return;}\n    setLocalError("");\n    setForm(value=>{const already=value.pairs.includes(pair);const next=already?value.pairs.filter(item=>item!==pair):[...value.pairs,pair];return{...value,pairs:next,pair:next[0]||value.pair};});\n  };`,
  "pair toggle",
);

replaceOnce(
  '    if(!form.allPairs&&!form.pairs.length)return setLocalError("Choose at least one Binance Spot pair or select All USDT pairs.");',
  `    if(!form.allPairs&&!form.pairs.length)return setLocalError("Choose at least one Binance Spot pair or select All USDT pairs.");\n    if(wantsMultiPair&&multiPairBlockedReason)return setLocalError(multiPairBlockedReason);`,
  "save pair validation",
);

replaceOnce(
  '<p>Use every Binance Spot USDT pair or build a custom market list.</p>',
  '<p>{multiPairBlockedReason||"Use every Binance Spot USDT pair or build a custom market list."}</p>',
  "coins helper copy",
);

replaceOnce(
  '<button type="button" className={form.allPairs?cfg.active:""} onClick={()=>setForm(v=>({...v,allPairs:true}))}>All coins</button>',
  '<button type="button" className={form.allPairs?cfg.active:""} disabled={Boolean(multiPairBlockedReason)} title={multiPairBlockedReason||undefined} onClick={()=>setForm(v=>({...v,allPairs:true}))}>All coins</button>',
  "all coins button",
);

replaceOnce(
  '<button type="button" onClick={()=>setForm(v=>({...v,pairs:pairs.map(item=>item.pair),pair:pairs[0]?.pair||v.pair}))}>Select all</button>',
  '<button type="button" disabled={Boolean(multiPairBlockedReason)} title={multiPairBlockedReason||undefined} onClick={()=>setForm(v=>({...v,pairs:pairs.map(item=>item.pair),pair:pairs[0]?.pair||v.pair}))}>Select all</button>',
  "select all button",
);

replaceOnce(
  '<input type="checkbox" checked={form.pairs.includes(item.pair)} onChange={()=>togglePair(item.pair)}/>',
  '<input type="checkbox" checked={form.pairs.includes(item.pair)} disabled={!form.pairs.includes(item.pair)&&form.pairs.length>=1&&Boolean(multiPairBlockedReason)} onChange={()=>togglePair(item.pair)}/>',
  "pair checkbox",
);

fs.writeFileSync(file, source);
console.log("Prepared Trader DCA plan-aware single/multi-pair limits.");
