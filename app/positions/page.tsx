import HostRoute from "../trader-v2/HostRoute";
import CoreV2ExitPlanControl from "../trader/CoreV2ExitPlanControl";

export default function PositionsPage() {
  return <>
    <HostRoute view="positions" />
    <div className="core-v2-position-inline-control"><CoreV2ExitPlanControl /></div>
    <style>{`.core-v2-position-inline-control > button:first-child{display:none!important}`}</style>
  </>;
}
