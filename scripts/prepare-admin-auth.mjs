import fs from "node:fs";
import path from "node:path";

function patchFile(relativePath, transforms) {
  const filePath = path.join(process.cwd(), ...relativePath.split("/"));
  let source = fs.readFileSync(filePath, "utf8");

  for (const { oldText, newText, label } of transforms) {
    if (source.includes(newText)) continue;
    const index = source.indexOf(oldText);
    if (index === -1) {
      throw new Error(`Could not prepare ${relativePath}: ${label} pattern was not found.`);
    }
    source = source.slice(0, index) + newText + source.slice(index + oldText.length);
  }

  fs.writeFileSync(filePath, source);
}

patchFile("app/admin/automation/page.tsx", [
  {
    oldText: "  | \"qualified\"\n  | \"queued\"\n",
    newText: "  | \"qualified\"\n  | \"held\"\n  | \"queued\"\n",
    label: "held prospect type",
  },
  {
    oldText: "  const pollLock = useRef(false);\n",
    newText: "  const pollLock = useRef(false);\n  const sessionRef = useRef<Session | null>(null);\n",
    label: "session reference",
  },
  {
    oldText: "    const currentSession = activeSession ?? session;\n",
    newText: "    const currentSession = activeSession ?? sessionRef.current;\n",
    label: "stable session lookup",
  },
  {
    oldText: "      pollLock.current = false;\n    }\n  }, [session]);\n",
    newText: "      pollLock.current = false;\n    }\n  }, []);\n",
    label: "stable load callback",
  },
  {
    oldText: "    supabase.auth.getSession().then(({ data }) => {\n      setSession(data.session);\n",
    newText: "    supabase.auth.getSession().then(({ data }) => {\n      sessionRef.current = data.session;\n      setSession(data.session);\n",
    label: "initial session reference",
  },
  {
    oldText: "    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {\n      setSession(nextSession);\n",
    newText: "    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {\n      sessionRef.current = nextSession;\n      setSession(nextSession);\n",
    label: "auth change session reference",
  },
  {
    oldText: "  const counts = useMemo(() => ({\n    total: prospects.length,\n    queued: prospects.filter((item) => item.status === \"queued\").length,\n    active: prospects.filter((item) => [\"in_production\", \"awaiting_final_review\", \"revision_requested\", \"approved_to_send\", \"needs_attention\"].includes(item.status)).length,\n    sent: prospects.filter((item) => item.status === \"email_sent\").length,\n    attention: prospects.filter((item) => item.status === \"needs_attention\").length,\n  }), [prospects]);\n",
    newText: "  const counts = useMemo(() => ({\n    total: prospects.length,\n    queued: prospects.filter((item) => item.status === \"queued\").length,\n    held: prospects.filter((item) => item.status === \"held\").length,\n    rejected: prospects.filter((item) => item.status === \"rejected\").length,\n    active: prospects.filter((item) => [\"in_production\", \"awaiting_final_review\", \"revision_requested\", \"approved_to_send\", \"needs_attention\"].includes(item.status)).length,\n    sent: prospects.filter((item) => item.status === \"email_sent\").length,\n    attention: prospects.filter((item) => item.status === \"needs_attention\").length,\n  }), [prospects]);\n",
    label: "queue classification counts",
  },
  {
    oldText: "        qualification_reason: form.score >= 75 ? \"Meets the automatic production threshold.\" : \"Held below the automatic production threshold.\",\n",
    newText: "        qualification_reason: form.score >= 50 ? \"Meets the automatic production threshold.\" : form.score >= 20 ? \"Held below the automatic production threshold.\" : \"Rejected below the minimum prospect threshold.\",\n",
    label: "manual qualification reason",
  },
  {
    oldText: "      setNotice(payload.qualification_score >= 75 ? \"Prospect added and queued automatically.\" : \"Prospect added to the database.\");\n",
    newText: "      setNotice(payload.qualification_score >= 50 ? \"Prospect added and queued automatically.\" : payload.qualification_score >= 20 ? \"Prospect added to the held list.\" : \"Prospect added to the rejected list.\");\n",
    label: "manual intake notice",
  },
  {
    oldText: "            <p className={styles.heroCopy}>Qualified prospects enter the production queue automatically. The system researches, builds, checks and publishes one PI website at a time. Your only standard checkpoint is the finished website and email.</p>\n",
    newText: "            <p className={styles.heroCopy}>Prospects scoring 50–100 enter the production queue automatically. Scores 20–49 are held, and scores 0–19 are rejected. The system researches, builds, checks and publishes one PI website at a time.</p>\n",
    label: "production hero thresholds",
  },
  {
    oldText: "          <div className={styles.stat}><span>Queued</span><strong>{counts.queued}</strong></div>\n          <div className={styles.stat}><span>Active</span><strong>{counts.active}</strong></div>\n",
    newText: "          <div className={styles.stat}><span>Queued 50–100</span><strong>{counts.queued}</strong></div>\n          <div className={styles.stat}><span>Held 20–49</span><strong>{counts.held}</strong></div>\n          <div className={styles.stat}><span>Rejected 0–19</span><strong>{counts.rejected}</strong></div>\n          <div className={styles.stat}><span>Active</span><strong>{counts.active}</strong></div>\n",
    label: "production classification statistics",
  },
  {
    oldText: "              <div className={styles.cardHeader}><div><p className={styles.kicker}>Prospect intake</p><h2>Add one PI</h2></div><span className={styles.status} data-status={form.score >= 75 ? \"queued\" : \"qualified\"}>{form.score >= 75 ? \"Auto-queue\" : \"Hold\"}</span></div>\n",
    newText: "              <div className={styles.cardHeader}><div><p className={styles.kicker}>Prospect intake</p><h2>Add one PI</h2></div><span className={styles.status} data-status={form.score >= 50 ? \"queued\" : form.score >= 20 ? \"held\" : \"rejected\"}>{form.score >= 50 ? \"Auto-queue\" : form.score >= 20 ? \"Hold\" : \"Reject\"}</span></div>\n",
    label: "manual intake classification badge",
  },
  {
    oldText: "              <section className={styles.card}><div className={styles.cardHeader}><div><p className={styles.kicker}>Production queue</p><h2>Ready for the next PI</h2></div></div><p className={styles.muted}>{counts.queued > 0 ? `${counts.queued} qualified prospect${counts.queued === 1 ? \" is\" : \"s are\"} waiting.` : \"There are no qualified prospects in the queue.\"}</p></section>\n",
    newText: "              <section className={styles.card}><div className={styles.cardHeader}><div><p className={styles.kicker}>Production queue</p><h2>Ready for the next PI</h2></div></div><p className={styles.muted}>{counts.queued > 0 ? `${counts.queued} buildable prospect${counts.queued === 1 ? \" is\" : \"s are\"} waiting.` : \"There are no buildable prospects in the queue.\"}</p></section>\n",
    label: "true production queue message",
  },
  {
    oldText: "  function updateMessage(id: string, patch: Partial<OutreachMessage>) {\n    setMessages((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));\n  }\n\n  if (!authReady)",
    newText: `  function updateMessage(id: string, patch: Partial<OutreachMessage>) {
    setMessages((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function renderProspectTable(kicker: string, title: string, items: Prospect[], emptyMessage: string) {
    return (
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div><p className={styles.kicker}>{kicker}</p><h2>{title}</h2></div>
          <span className={styles.muted}>{items.length} record{items.length === 1 ? "" : "s"}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>PI</th><th>Institution</th><th>Score</th><th>Status</th><th>Priority</th><th>Added</th></tr></thead>
            <tbody>
              {items.length === 0 ? <tr><td colSpan={6}>{emptyMessage}</td></tr> : items.map((prospect) => (
                <tr key={prospect.id}>
                  <td><strong>{prospect.pi_name}</strong>{prospect.research_area ? <><br /><small className={styles.muted}>{prospect.research_area}</small></> : null}</td>
                  <td>{prospect.institution}{prospect.country ? <><br /><small className={styles.muted}>{prospect.country}</small></> : null}</td>
                  <td>{prospect.qualification_score}</td>
                  <td><span className={styles.status} data-status={prospect.status}>{statusText(prospect.status)}</span></td>
                  <td>{prospect.priority}</td>
                  <td>{formatDate(prospect.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (!authReady)`,
    label: "classified prospect table renderer",
  },
  {
    oldText: `            <section className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Prospect database</p><h2>Production queue</h2></div><span className={styles.muted}>{prospects.length} records</span></div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>PI</th><th>Institution</th><th>Score</th><th>Status</th><th>Priority</th><th>Added</th></tr></thead>
                  <tbody>
                    {prospects.length === 0 ? <tr><td colSpan={6}>No prospects yet.</td></tr> : prospects.map((prospect) => (
                      <tr key={prospect.id}>
                        <td><strong>{prospect.pi_name}</strong>{prospect.research_area ? <><br /><small className={styles.muted}>{prospect.research_area}</small></> : null}</td>
                        <td>{prospect.institution}{prospect.country ? <><br /><small className={styles.muted}>{prospect.country}</small></> : null}</td>
                        <td>{prospect.qualification_score}</td>
                        <td><span className={styles.status} data-status={prospect.status}>{statusText(prospect.status)}</span></td>
                        <td>{prospect.priority}</td>
                        <td>{formatDate(prospect.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>`,
    newText: `            {renderProspectTable("Buildable prospects · score 50–100", "Production queue", prospects.filter((prospect) => prospect.status === "queued"), "No prospects are currently waiting to be built.")}
            {renderProspectTable("Held prospects · score 20–49", "Held for later", prospects.filter((prospect) => prospect.status === "held"), "No prospects are currently held.")}
            {renderProspectTable("Rejected prospects · score 0–19", "Rejected", prospects.filter((prospect) => prospect.status === "rejected"), "No prospects have been rejected by scoring.")}
            {renderProspectTable("Active and completed records", "Pipeline history", prospects.filter((prospect) => !["queued", "held", "rejected"].includes(prospect.status)), "No prospects have entered production yet.")}`,
    label: "separate production, held, rejected and history tables",
  },
]);

patchFile("app/admin/discovery/page.tsx", [
  {
    oldText: "    queued: prospects.filter((item) => item.status === \"queued\").length,\n    held: prospects.filter((item) => item.status === \"qualified\" || item.status === \"discovered\").length,\n",
    newText: "    queued: prospects.filter((item) => item.status === \"queued\").length,\n    held: prospects.filter((item) => item.status === \"held\").length,\n    rejected: prospects.filter((item) => item.status === \"rejected\").length,\n",
    label: "discovery classification totals",
  },
  {
    oldText: "            <p className={styles.heroCopy}>The discovery engine searches current academic sources, verifies independent PI status, evaluates website opportunity, removes duplicates and automatically queues prospects scoring 75 or higher.</p>\n",
    newText: "            <p className={styles.heroCopy}>The discovery engine searches current academic sources, verifies independent PI status, evaluates website opportunity and removes duplicates. Scores 50–100 are queued, 20–49 are held, and 0–19 are rejected.</p>\n",
    label: "discovery hero thresholds",
  },
  {
    oldText: "          <div className={styles.stat}><span>Queued ≥75</span><strong>{totals.queued}</strong></div>\n          <div className={styles.stat}><span>Held below 75</span><strong>{totals.held}</strong></div>\n",
    newText: "          <div className={styles.stat}><span>Queued 50–100</span><strong>{totals.queued}</strong></div>\n          <div className={styles.stat}><span>Held 20–49</span><strong>{totals.held}</strong></div>\n          <div className={styles.stat}><span>Rejected 0–19</span><strong>{totals.rejected}</strong></div>\n",
    label: "discovery classification statistics",
  },
  {
    oldText: "                  <input value=\"75 / 100\" readOnly />\n",
    newText: "                  <input value=\"50 / 100\" readOnly />\n",
    label: "discovery production threshold",
  },
]);

patchFile("app/admin/automation/automation.module.css", [
  {
    oldText: "  grid-template-columns: repeat(5, minmax(0, 1fr));\n",
    newText: "  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));\n",
    label: "responsive classification statistics",
  },
  {
    oldText: ".status[data-status=\"awaiting_final_review\"],\n",
    newText: `.status[data-status="held"] {
  border-color: #cbbd8a;
  background: #f7f0d8;
  color: #6d5b1d;
}

.status[data-status="rejected"] {
  border-color: #d0a0a0;
  background: #fae9e7;
  color: #8b3030;
}

.status[data-status="awaiting_final_review"],
`,
    label: "held and rejected status styles",
  },
]);

console.log("Admin authentication and prospect scoring interfaces prepared.");
