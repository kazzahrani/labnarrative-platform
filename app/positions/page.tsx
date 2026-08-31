import HostRoute from "../trader-v2/HostRoute";
import CoreV2ExitPlanControl from "../trader/CoreV2ExitPlanControl";

export default function PositionsPage() {
  return <>
    <HostRoute view="positions" />
    <CoreV2ExitPlanControl />
  </>;
}
