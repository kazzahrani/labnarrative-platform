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

type PositionMath = {
  invested: number;
  quantity: number;
  average: number;
  averageDrop: number;
  currentPrice: number;
  unrealized: number;
  tpPrice: number;
  tpVsInitial: number;
  recoveryToTp: number;
};

const money = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);

const signedPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

function positionMath(baseOrder: number, filledRows: LadderRow[], tpPct: number, currentDrop: number): PositionMath {
  const initialPrice = 100;
  let invested = Math.max(0, baseOrder);
  let quantity = invested > 0 ? invested / initialPrice : 0;

  for (const row of filledRows) {
    const fillPrice = Math.max(0.0001, initialPrice * (1 - row.drop / 100));
    const quoteAmount = Math.max(0, row.order);
    invested += quoteAmount;
    quantity += quoteAmount > 0 ? quoteAmount / fillPrice : 0;
  }

  const average = quantity > 0 ? invested / quantity : initialPrice;
  const currentPrice = Math.max(0.0001, initialPrice * (1 - currentDrop / 100));
  const tpPrice = average * (1 + Math.max(0, tpPct) / 100);

  return {
    invested,
    quantity,
    average,
    averageDrop: Math.max(0, (1 - average / initialPrice) * 100),
    currentPrice,
    unrealized: average > 0 ? (currentPrice / average - 1) * 100 : 0,
    tpPrice,
    tpVsInitial: (tpPrice / initialPrice - 1) * 100,
    recoveryToTp: currentPrice > 0 ? (tpPrice / currentPrice - 1) * 100 : 0,
  };
}

function StrategyCheck({ ok, label, detail }: CheckProps) {
  return <div className={cfg.strategyCheck}>
    <span><i aria-hidden="true">{ok ? "✓" : "!"}</i>{label}</span>
    <b>{detail}</b>
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
  const tp1Pct = Number(targets[0]?.profitPct ?? takeProfit);

  const map = useMemo(() => {
    const initialPrice = 100;
    let invested = Math.max(0, baseOrder);
    let quantity = invested > 0 ? invested / initialPrice : 0;

    const levels = ladder.map((row) => {
      const price = Math.max(0.0001, initialPrice * (1 - row.drop / 100));
      const quoteAmount = Math.max(0, row.order);
      invested += quoteAmount;
      quantity += quoteAmount > 0 ? quoteAmount / price : 0;
      const average = quantity > 0 ? invested / quantity : initialPrice;
      return {
        ...row,
        price,
        invested,
        average,
        averageDrop: Math.max(0, (1 - average / initialPrice) * 100),
      };
    });

    const deepest = levels.at(-1)?.drop ?? 0;
    const finalState = positionMath(baseOrder, ladder, tp1Pct, deepest);

    return {
      levels,
      deepest,
      finalAverageDrop: finalState.averageDrop,
      finalTpVsInitial: finalState.tpVsInitial,
      recoveryToTp1: finalState.recoveryToTp,
    };
  }, [baseOrder, ladder, tp1Pct]);

  const scenarioMax = Math.min(90, Math.max(
    35,
    Math.ceil(map.deepest + 10),
    stopEnabled ? Math.ceil(stopPct + 5) : 0,
  ));
  const appliedScenarioDrop = Math.min(scenarioDrop, scenarioMax);

  const scenario = useMemo(() => {
    const filled = ladder.filter((row) => row.drop <= appliedScenarioDrop + 1e-9);
    const state = positionMath(baseOrder, filled, tp1Pct, appliedScenarioDrop);
    return {
      filled: filled.length,
      invested: state.invested,
      averageDrop: state.averageDrop,
      unrealized: state.unrealized,
      tpVsInitial: state.tpVsInitial,
      recovery: state.recoveryToTp,
    };
  }, [appliedScenarioDrop, baseOrder, ladder, tp1Pct]);

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
            {targets.map((target, index) => <span key={index}>TP{index + 1} +{target.profitPct}% from avg · {target.allocationPct}%</span>)}
            {stopEnabled && <span>SL -{stopPct}% from avg</span>}
          </div>
        </div>
      </div>

      <div className={cfg.strategyMapOutcomes}>
        <div>
          <div className={cfg.strategyMapSectionHead}><div><strong>Outcome</strong><small>What the complete plan means financially.</small></div></div>
          <div className={`${cfg.summaryGrid} ${cfg.strategyMapMetrics}`}>
            <div><span>Final average entry</span><b>-{map.finalAverageDrop.toFixed(2)}%</b></div>
            <div><span>TP1 after full DCA</span><b>{signedPct(map.finalTpVsInitial)}</b></div>
            <div><span>Position capacity</span><b>{maxActivePositions}</b></div>
            <div><span>TP targets</span><b>{targets.length}</b></div>
          </div>
        </div>

        <div>
          <div className={cfg.strategyMapSectionHead}><div><strong>Live checks</strong><small>Updates instantly.</small></div></div>
          <div className={`${cfg.summaryGrid} ${cfg.strategyChecks}`}>
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
      <div className={cfg.strategyScenarioScale}><span>-{scenarioMax.toFixed(0)}%</span><span>ENTRY</span></div>
      <input aria-label="Price drop scenario" type="range" min="0" max={scenarioMax} step="0.5" value={appliedScenarioDrop} onChange={(event) => setScenarioDrop(Number(event.target.value))}/>
      <div className={`${cfg.summaryGrid} ${cfg.strategyScenarioMetrics}`}>
        <div><span>DCA filled</span><b>{scenario.filled} / {ladder.length}</b></div>
        <div><span>Invested</span><b>{money(scenario.invested)}</b></div>
        <div><span>Average entry</span><b>-{scenario.averageDrop.toFixed(2)}%</b></div>
        <div><span>Unrealized P/L</span><b>{signedPct(scenario.unrealized)}</b></div>
        <div><span>Recovery to TP1</span><b>{scenario.recovery <= 0 ? "Target reached" : signedPct(scenario.recovery)}</b></div>
      </div>
      <small>TP1 is +{tp1Pct.toFixed(2)}% from the simulated weighted average entry, placing TP1 at {signedPct(scenario.tpVsInitial)} versus the original entry. Recovery is the rise required from the simulated current price to that TP1 level. Preview uses normalized theoretical fills; live fills can differ slightly because of fees and exchange rounding.</small>
    </div>
  </section>;
}
