# Company inspection checklist

The Inspection page defaults to a company checklist; existing workflow registers remain in **Evidence & history**. Start a checklist per company to initialize 46 checkpoints in 15 areas from Dalal’s supplied `05. Ispection checklist` overview. This is a preparation template, not a current regulatory requirements catalogue or compliance certification. Company SOPs and applicable requirements need human assessment. Critical/Major finding grades from the source are not assigned automatically.

Administrators, QPPVs and Deputy QPPVs can initialize and review. A checkpoint owner can prepare evidence. Links can reference same-company tasks, active task evidence, completed screening records, frozen handover evidence covering the company, or versioned HTTPS document references. Task status and evidence notes alone do not satisfy the supporting-reference requirement for Reviewed.

Every conclusion requires a note. Not applicable requires justification. Actor, email, role, server time and source-record snapshots are retained in append-only review history and audit events. Preparation/link edits require a new review; source-record changes flag Needs re-review on refresh/export. Reference snapshots do not include document bytes or detect remote content changing behind an unchanged URL/version. This is readiness assessment, not an automated evidence-quality assessment.

Mutation RPCs validate live workspace membership, roles, source company and expected revision. Browser roles have read-only table grants. Initialization is idempotent. CSV and full JSON exports include checkpoint state, linked references and all review cycles; JSON preserves original snapshot payloads.

Verification: `node scripts/test-pvos-inspection.mjs`, `node scripts/test-pvos-inspection-checklist.mjs`, TypeScript and the production build. `supabase/tests/inspection_checklist.sql` exercises database invariants and authenticated RLS/RPC permissions in a transaction that is always rolled back. Component fixture checks are not authenticated browser verification.
