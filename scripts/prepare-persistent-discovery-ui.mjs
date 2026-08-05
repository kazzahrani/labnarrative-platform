import fs from "node:fs";

const pageUrl = new URL("../app/admin/discovery/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

if (!source.includes("campaignMode?: boolean;")) {
  source = source.replace(
    "type RunSummary = {\n",
    "type RunSummary = {\n  campaignMode?: boolean;\n  progressMessage?: string;\n  currentBatch?: number;\n  maxBatches?: number;\n  stopReason?: string;\n  targetType?: string;\n",
  );
}

if (!source.includes("campaign_mode?: boolean;")) {
  source = source.replace(
    "  completed_at: string | null;\n};\n\ntype CandidateStatus",
    "  completed_at: string | null;\n  campaign_mode?: boolean;\n  worker_state?: \"idle\" | \"processing\";\n  batch_size?: number;\n  batches_attempted?: number;\n  no_progress_batches?: number;\n  max_batches?: number;\n  max_no_progress_batches?: number;\n  expires_at?: string | null;\n  last_batch_started_at?: string | null;\n  last_batch_completed_at?: string | null;\n};\n\ntype CandidateStatus",
  );
}

if (!source.includes("started?: boolean;")) {
  source = source.replace(
    "type DiscoveryResponse = {\n  ok?: boolean;\n",
    "type DiscoveryResponse = {\n  ok?: boolean;\n  started?: boolean;\n  runId?: string;\n  status?: string;\n  target?: number;\n  message?: string;\n",
  );
}

if (!source.includes("const hasRunningCampaign")) {
  source = source.replace(
    "  const queuedCandidates = useMemo(\n",
    `  const hasRunningCampaign = useMemo(
    () => runs.some((run) => run.status === "running"),
    [runs],
  );

  useEffect(() => {
    if (!session || role !== "admin" || !hasRunningCampaign) return;
    const timer = window.setInterval(() => void loadData(session), 15_000);
    return () => window.clearInterval(timer);
  }, [hasRunningCampaign, loadData, role, session]);

  const queuedCandidates = useMemo(
`,
  );
}

source = source.replace(
  "Searching, verifying and automatically queueing production-quality prospects. This may take up to two minutes.",
  "Starting a persistent discovery campaign. It will continue in the background after this page is closed.",
);

source = source.replace(
  /      const result = \(data \?\? \{\}\) as DiscoveryResponse;\n      if \(result\.error\) throw new Error\(result\.error\);[\s\S]*?      setNoticeError\(false\);\n    \} catch/,
  `      const result = (data ?? {}) as DiscoveryResponse;
      if (result.error) throw new Error(result.error);

      await loadData(session);

      if (result.started) {
        setNotice(
          result.message ||
            \`Persistent discovery campaign started. The engine will keep searching in small verified batches until it auto-queues \${result.target ?? count} production-quality prospects. You may close this page.\`,
        );
        setNoticeError(false);
      } else {
        const autoQueued = Math.max(result.queued ?? 0, result.reviewReady ?? 0);
        const shortfall = result.shortfallReason ? \` \${result.shortfallReason}\` : "";
        setNotice(
          \`Discovery completed: \${result.found ?? 0} verified, \${autoQueued} automatically queued, \${result.held ?? 0} held, \${result.rejected ?? 0} rejected, \${result.invalid ?? 0} invalid and \${result.duplicates ?? 0} duplicates.\${shortfall}\`,
        );
        setNoticeError(false);
      }
    } catch`,
);

source = source.replace(
  /The engine searches several academic-source strategies, requires\s+an official PI profile and evidence sources, detects duplicates,\s+penalises strong existing websites, and automatically sends every\s+verified production-quality prospect into the automation queue\./,
  "The engine runs persistent background campaigns, searches different regions and academic-source strategies in small batches, verifies official PI profiles, removes duplicates, penalises strong existing websites, and continues until the requested number of production-quality prospects has been auto-queued.",
);

source = source.replace(
  /Best practice: use one coherent research cluster, specify a\s+country or region, leave institutions blank for broad discovery,\s+and request five candidates per run\./,
  "Set a target of up to 50 production-quality prospects. Leaving countries blank starts a worldwide campaign that rotates across regions; specifying countries focuses every batch there. The campaign continues in the background for up to 24 hours and stops when the target is reached or repeated searches produce no new qualified prospects.",
);

source = source
  .replace("<label>Number of candidates</label>", "<label>Target production-quality prospects</label>")
  .replace("                    max={20}\n", "                    max={50}\n")
  .replace('                    : "Discover and auto-queue prospects"}', '                    : "Start persistent discovery campaign"}')
  .replace("<th>Requested</th>", "<th>Target</th>");

if (!source.includes('run.result_summary?.progressMessage')) {
  source = source.replace(
    `                            {run.result_summary?.shortfallReason ? (
`,
    `                            {run.status === "running" && run.result_summary?.progressMessage ? (
                              <>
                                <br />
                                <small className={styles.muted}>
                                  {run.result_summary.progressMessage}
                                </small>
                              </>
                            ) : null}
                            {run.result_summary?.shortfallReason ? (
`,
  );
}

if (!source.includes("persistent discovery campaign")) {
  throw new Error("Persistent discovery interface text was not applied.");
}
if (!source.includes("max={50}")) {
  throw new Error("Persistent discovery target limit was not applied.");
}
if (!source.includes("hasRunningCampaign")) {
  throw new Error("Persistent discovery polling was not applied.");
}

fs.writeFileSync(pageUrl, source);
console.log("Persistent prospect discovery interface prepared.");
