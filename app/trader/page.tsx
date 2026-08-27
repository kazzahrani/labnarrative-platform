import type { Metadata } from "next";
import TraderExperienceLayer from "./TraderExperienceLayer";

export const metadata: Metadata = {
  title: "LabNarrative Trading",
  description: "Design, test, automate, and compare crypto DCA strategies with Paper and Real trading workspaces.",
};

export default function TraderPage() {
  return <TraderExperienceLayer />;
}
