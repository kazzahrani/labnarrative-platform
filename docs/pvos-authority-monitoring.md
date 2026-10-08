# Authority monitoring

Signal → Authority monitoring has three views: Due for review, Records and Settings.

An administrator, QPPV or Deputy QPPV confirms each company's products, required
authorities, monitoring owner, independent QPPV reviewer, SOP/version and company
form/version. The initial SFDA/MHRA/FDA/EMA candidates are not a complete WHO
authority list. Company-specific applicability and additional channels must be
confirmed by the QPPV. Settings create monthly tasks and frozen period scopes;
changes apply to future periods. An existing period's reviewer can be changed
with a reason before submission. Prior review cycles keep their original recipient.

## Collection and coverage

`pvos-authority-monitor` runs at `15 */4 * * *` UTC through Supabase pg_cron,
pg_net and Vault. Its endpoint authenticates the existing literature cron secret;
no browser receives that secret. Only these exact feeds are fetched:

- MHRA Drug Safety Update: https://www.gov.uk/drug-safety-update.atom
- FDA MedWatch: https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml

SFDA, EMA DHPC and added authorities require manual checks. Successful collection
means the named feed was fetched and parsed; it does not establish complete
website, archive, product or calendar-period coverage. Feed summaries are not
full notice content. FDA MedWatch includes non-drug notices. All notices remain
available; product matching provides suggestions and never excludes unmatched
notices. Original publisher URLs are retained when official FDA HTTP URLs are
normalized to their verified HTTPS equivalent.

Initial feed entries are labelled baseline. Subsequent unchanged notices are
deduplicated; changed versions are appended with first-seen dates and hashes.
Published-in-period notices and newly discovered older notices remain accessible.
Human archive/additional-channel checks are required where a rolling feed cannot
establish complete period coverage. Collection errors, entry counts, publication
ranges and coverage notes are visible.

## Human workflow

The owner prepares source checks and records relevant, not relevant or unresolved
findings. Relevant findings require affected company products and a rationale.
Explicit escalation adds an unassessed authority finding to Signal Review;
it does not validate a signal or create a literature record. Escalated findings
retain their original evidence. Authority signal assessments use server-recorded
actors and require a rationale; potential signals remain under review.

Each source has an explicit human outcome and conclusion. Unchecked/unavailable
sources and unresolved findings block submission. Newly collected in-scope
notices or product changes after a check require another check. A month can be
submitted only after it ends, to the named independent reviewer. Preparation is
locked while review is pending; the owner can withdraw with a reason. Only the
named live QPPV reviewer can Approve or Return with a conclusion/reason. New
in-scope notices after submission block approval until the evidence is refreshed.

Approval freezes both reviewers, timestamps, decisions, source checks, findings,
products, scope and collection history with a SHA-256 hash. It completes the
linked monitoring task and adds evidence. Approved records and previous review
cycles are immutable. Later notices do not rewrite approved evidence. Monthly
tasks open the exact monitoring period; generic task completion, reopening and
generic reviewer routing cannot bypass the independent monitoring workflow.
Inspection includes the register, review cycles and original snapshots in company-scoped
CSV/JSON exports; approved records can be linked to checklist requirements.
Linking evidence alone does not mark a checklist requirement compliant.

## Verification

- `node scripts/test-pvos-authority-feeds.mjs`: parser, failures, allowlist,
  original links, baseline/date windows and product matching.
- `node scripts/test-pvos-authority-workflow.mjs`: real component handlers with
  fixture responses, named routing, role-specific controls, source gaps,
  returned/reassigned reviews and Signal integration. Not an authenticated
  browser test.
- `node scripts/test-pvos-inspection.mjs`: company scope, original snapshots,
  dual-review exports, pagination and read failures.
- `supabase/tests/authority_monitoring.sql`: rollback transaction covering real
  authorization, revisions, independent review, immutable evidence, source gaps,
  signal origin/actor enforcement, version deduplication and tenant isolation.
- `cd pvos-app && npm run build`.

Live collection verification on 2026-10-08 retrieved a baseline of 50 MHRA and
20 FDA feed entries per workspace. A repeat collection added zero notice versions.
These are collection counts, not clinically relevant findings or completeness claims.
