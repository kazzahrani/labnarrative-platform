"use client";

import { useMemo, useState } from "react";
import cfg from "./dca-bot-configurator.module.css";

type TpTarget = { profitPct: number; allocationPct: number };
type LadderRow = { index: number; drop: number; order: number };

type Props = {
  baseOrder: number;
  ladder: LadderRow[];
  activeDcaOrders: number;
  maxActivePositions: number;
  plannedCapitalPerPosition: number;
  availableBalance?: number;
  takeProfit: number;
  takeProfitTargets?: TpTarget[];
  stopEnabled: boolean;
  stopPct: number;
};

type CheckProps = { ok: boolean; label: string; detail: string };

const money = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);

const signedPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

function StrategyCheck({ ok, label, detail }: CheckProps) {
  return <div className={cfg.strategyCheck} style={{ gridTemplateColumns: "16px minmax(0,1fr)", gap: 6, alignItems: "center", padding: "3px 0" }}>
    <span style={{ width: 16, height: 16, fontSize: 9, lineHeight: 1, opacity: .72 }}>{ok ? "✓" : "!"}</span>
    <div style={{ display: "grid", gap: 1, minWidth: 0 }}>
      <b style={{ fontSize: 9, lineHeight: 1.1, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</b>
      <small style={{ fontSize: 10, lineHeight: 1.2, opacity: .72 }}>{detail}</small>
    </div>
  </div>;
}

export default function DcaStrategyMap({
  baseOrder,
  ladder,
  activeDcaOrders,
  maxActivePositions,
  plannedCapitalPerPosition,
  availableBalance,
  takeProfit,
  takeProfitTargets,
  stopEnabled,
  stopPct,
}: Props) {
  const [scenarioDrop, setScenarioDrop] = useState(0);
  const targets = takeProfitTargets?.length ? takeProfitTargets : [{ profitPct: takeProfit, allocationPct: 100 }];

  const map = useMemo(() => {
    const entryPrice = 100;
    let invested = Math.max(0, baseOrder);
    let quantity = invested > 0 ? invested / entryPrice : 0;

    const levels = ladder.map((row) => {
      const price = Math.max(0.0001, entryPrice * (1 - row.drop / 100));
      invested += Math.max(0, row.order);
      quantity += row.order > 0 ? row.order / price : 0;
      const average = quantity > 0 ? invested / quantity : entryPrice;
      return {
        ...row,
        price,
        invested,
        average,
        averageDrop: Math.max(0, (1 - average / entryPrice) * 100),
      };
    });

    const deepest = levels.at(-1)?.drop ?? 0;
    const finalAverage = levels.at(-1)?.average ?? entryPrice;
    const finalAverageDrop = Math.max(0, (1 - finalAverage / entryPrice) * 100);
    const deepestPrice = Math.max(0.0001, entryPrice * (1 - deepest / 100));
    const tp1 = targets[0]?.profitPct ?? takeProfit;
    const recoveryToTp1 = (finalAverage * (1 + tp1 / 100) / deepestPrice - 1) * 100;

    return { levels, deepest, finalAverageDrop, recoveryToTp1 };
  }, [baseOrder, ladder, takeProfit, targets]);

  const scenarioMax = Math.min(90, Math.max(
    35,
    Math.ceil(map.deepest + 10),
    stopEnabled ? Math.ceil(stopPct + 5) : 0,
  ));
  const appliedScenarioDrop = Math.min(scenarioDrop, scenarioMax);

  const scenario = useMemo(() => {
    const entryPrice = 100;
    const filled = ladder.filter((row) => row.drop <= appliedScenarioDrop + 1e-9);
    let invested = Math.max(0, baseOrder);
    let quantity = invested > 0 ? invested / entryPrice : 0;
    for (const row of filled) {
      const price = Math.max(0.0001, entryPrice * (1 - row.drop / 100));
      invested += Math.max(0, row.order);
      quantity += row.order > 0 ? row.order / price : 0;
    }
    const average = quantity > 0 ? invested / quantity : entryPrice;
    const currentPrice = Math.max(0.0001, entryPrice * (1 - appliedScenarioDrop / 100));
    const unrealized = (currentPrice / average - 1) * 100;
    const tp1 = targets[0]?.profitPct ?? takeProfit;
    const tp1Price = average * (1 + tp1 / 100);
    const recovery = (tp1Price / currentPrice - 1) * 100;
    const averageDrop = Math.max(0, (1 - average / entryPrice) * 100);
    return { filled: filled.length, invested, averageDrop, unrealized, recovery };
  }, [appliedScenarioDrop, baseOrder, ladder, takeProfit, targets]);

  const tpTotal = targets.reduce((sum, target) => sum + Number(target.allocationPct || 0), 0);
  const tpAscending = targets.every((target, index) => index === 0 || target.profitPct > targets[index - 1].profitPct);
  const capitalValid = baseOrder > 0 && ladder.every((row) => row.order > 0);
  const ladderValid = map.deepest < 100;
  const activeWindowValid = activeDcaOrders >= 0 && activeDcaOrders <= ladder.length;
  const tpValid = targets.length > 0 && targets.every((target) => target.profitPct > 0 && target.allocationPct > 0) && Math.abs(tpTotal - 100) <= 0.01 && tpAscending;
  const maximumBotCapital = plannedCapitalPerPosition * Math.max(1, maxActivePositions);
  const available = Number.isFinite(availableBalance) ? Math.max(0, Number(availableBalance)) : null;
  const exposurePct = available != null && available > 0 ? maximumBotCapital / available * 100 : null;
  const withinAvailable = available == null || maximumBotCapital <= available + 0.01;

  return <section className={`${cfg.preview} ${cfg.strategyMap}`}>
    <div className={cfg.cardHead}>
      <div>
        <h3>Strategy Map</h3>
        <p>See how capital, average entry and recovery change across the full DCA path.</p>
      </div>
    </div>

    <div className={cfg.previewSummary}>
      <div><span>Capital / position</span><b>{money(plannedCapitalPerPosition)}</b></div>
      <div><span>Maximum bot capital</span><b>{money(maximumBotCapital)}</b></div>
      <div><span>DCA coverage</span><b>-{map.deepest.toFixed(2)}%</b></div>
      <div><span>Recovery after full DCA</span><b>{signedPct(map.recoveryToTp1)}</b></div>
    </div>

    <div className={cfg.strategyMapBody}>
      <div className={cfg.strategyMapLadder}>
        <div className={cfg.strategyMapSectionHead}>
          <div><strong>Entry & DCA ladder</strong><small>Average entry is shown relative to the initial entry price.</small></div>
        </div>
        <div className={cfg.previewHead}><span>Level</span><span>Trigger</span><span>Order</span><span>Invested</span><span>Avg entry</span></div>
        <div className={cfg.previewRow}><span>ENTRY</span><span>0.00%</span><span>{money(baseOrder)}</span><span>{money(baseOrder)}</span><span>0.00%</span></div>
        {map.levels.map((row) => <div className={cfg.previewRow} key={row.index}>
          <span>DCA {row.index} · {row.index <= activeDcaOrders ? "active" : "queued"}</span>
          <span>-{row.drop.toFixed(2)}%</span>
          <span>{money(row.order)}</span>
          <span>{money(row.invested)}</span>
          <span>-{row.averageDrop.toFixed(2)}%</span>
        </div>)}

        <div className={cfg.strategyMapExitTags}>
          <span>Exit map</span>
          <div className={cfg.chips}>
            {targets.map((target, index) => <span key={index}>TP{index + 1} +{target.profitPct}% · {target.allocationPct}%</span>)}
            {stopEnabled && <span>SL -{stopPct}%</span>}
          </div>
        </div>
      </div>

      <div className={cfg.strategyMapOutcomes}>
        <div>
          <div className={cfg.strategyMapSectionHead}><div><strong>Outcome</strong><small>What the complete plan means financially.</small></div></div>
          <div className={`${cfg.summaryGrid} ${cfg.strategyMapMetrics}`}>
            <div><span>Final average entry</span><b>-{map.finalAverageDrop.toFixed(2)}%</b></div>
            <div><span>Orders / position</span><b>{ladder.length + 1}</b></div>
            <div><span>Position capacity</span><b>{maxActivePositions}</b></div>
            <div><span>TP targets</span><b>{targets.length}</b></div>
          </div>
        </div>

        <div>
          <div className={cfg.strategyMapSectionHead} style={{ marginBottom: 5 }}><div><strong style={{ fontSize: 12, lineHeight: 1.15 }}>Live checks</strong><small style={{ fontSize: 9, lineHeight: 1.2, opacity: .65 }}>Updates instantly.</small></div></div>
          <div className={cfg.strategyChecks} style={{ gap: 4 }}>
            <StrategyCheck ok={capitalValid} label="Capital ladder" detail={capitalValid ? `${money(plannedCapitalPerPosition)} / position` : "Order amounts must be greater than zero."}/>
            <StrategyCheck ok={tpValid} label="TP allocation" detail={tpValid ? `100% across ${targets.length} target${targets.length === 1 ? "" : "s"}` : `Need ascending targets and 100% allocation · ${tpTotal.toFixed(2)}% now`}/>
            <StrategyCheck ok={ladderValid} label="DCA coverage" detail={ladderValid ? `${map.deepest.toFixed(2)}% below entry` : `${map.deepest.toFixed(2)}% is invalid · must stay below 100%`}/>
            <StrategyCheck ok={activeWindowValid} label="Active DCA window" detail={activeWindowValid ? `${activeDcaOrders} of ${ladder.length} active at once` : "Active orders exceed the configured ladder."}/>
            {available != null && <StrategyCheck ok={withinAvailable} label="Capital exposure" detail={withinAvailable ? (exposurePct == null ? `${money(maximumBotCapital)} max · ${money(available)} available` : `${money(maximumBotCapital)} max · ${exposurePct.toFixed(1)}% of available`) : `Need ${money(maximumBotCapital)} · ${money(available)} available · ${money(maximumBotCapital - available)} short`}/>}          
          </div>
        </div>
      </div>
    </div>

    <div className={cfg.strategyScenario}>
      <div className={cfg.strategyScenarioHead}>
        <div><strong>Price scenario</strong><small>Drag left from ENTRY to simulate a deeper market drop.</small></div>
        <b>{appliedScenarioDrop === 0 ? "ENTRY" : `-${appliedScenarioDrop.toFixed(1)}%`}</b>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, lineHeight: 1, opacity: .6 }}><span>-{scenarioMax.toFixed(0)}%</span><span>ENTRY</span></div>
      <input aria-label="Price drop scenario" style={{ width: "100%", direction: "rtl" }} type="range" min="0" max={scenarioMax} step="0.5" value={appliedScenarioDrop} onChange={(event) => setScenarioDrop(Number(event.target.value))}/>
      <div className={`${cfg.summaryGrid} ${cfg.strategyScenarioMetrics}`}>
        <div><span>DCA filled</span><b>{scenario.filled} / {ladder.length}</b></div>
        <div><span>Invested</span><b>{money(scenario.invested)}</b></div>
        <div><span>Average entry</span><b>-{scenario.averageDrop.toFixed(2)}%</b></div>
        <div><span>Unrealized P/L</span><b>{signedPct(scenario.unrealized)}</b></div>
        <div><span>Recovery to TP1</span><b>{scenario.recovery <= 0 ? "Target reached" : signedPct(scenario.recovery)}</b></div>
      </div>
      <small>Scenario calculations normalize the initial entry price to 100, so the percentages remain valid for any selected market.</small>
    </div>
  </section>;
}
