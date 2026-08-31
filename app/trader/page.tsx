import type { Metadata } from "next";
import CoreV2ExitPlanCanary from "./CoreV2ExitPlanCanary";
import TraderV2FullShellCutover from "./TraderV2FullShellCutover";

export const metadata: Metadata = {
  title: "LabNarrative Trading",
  description: "Design, test, automate, and compare crypto DCA strategies with Paper and Real trading workspaces.",
};

export default function TraderPage() {
  return <>
    <TraderV2FullShellCutover />
    <CoreV2ExitPlanCanary />
  </>;
}
