import fs from "node:fs";

const pageUrl = new URL("../app/admin/discovery/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const kickerToken = '<p className={styles.kicker}>Discovery brief</p>';
const kickerIndex = source.indexOf(kickerToken);
if (kickerIndex === -1) {
  throw new Error("The Discovery brief heading was not found.");
}

const cardStartToken = "          <section className={styles.card}>";
const cardStart = source.lastIndexOf(cardStartToken, kickerIndex);
if (cardStart === -1) {
  throw new Error("The Discovery brief card start was not found.");
}

const cardEndToken = "\n          </section>";
const cardEndStart = source.indexOf(cardEndToken, kickerIndex);
if (cardEndStart === -1) {
  throw new Error("The Discovery brief card ending was not found.");
}

const cardEnd = cardEndStart + cardEndToken.length;
const discoveryCard = source.slice(cardStart, cardEnd);
const modalCard = discoveryCard
  .trim()
  .replace(
    "<section className={styles.card}>",
    '<section className={`${styles.card} automationProspectModalCard`}>',
  );

if (!source.includes("const [discoveryModalOpen, setDiscoveryModalOpen]")) {
  const stateToken = "  const [noticeError, setNoticeError] = useState(false);\n";
  if (!source.includes(stateToken)) {
    throw new Error("The Discovery modal state insertion point was not found.");
  }
  source = source.replace(
    stateToken,
    `${stateToken}  const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);\n`,
  );
}

if (!source.includes('document.body.style.overflow = "hidden"')) {
  const effectToken = "  const queuedCandidates = useMemo(\n";
  if (!source.includes(effectToken)) {
    throw new Error("The Discovery modal effect insertion point was not found.");
  }

  const modalEffect = `  useEffect(() => {
    if (!discoveryModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDiscoveryModalOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [discoveryModalOpen]);

`;

  source = source.replace(effectToken, `${modalEffect}${effectToken}`);
}

if (!source.includes("setDiscoveryModalOpen(true)")) {
  const actionsToken = "          <div className={styles.heroActions}>\n";
  if (!source.includes(actionsToken)) {
    throw new Error("The Discovery hero action area was not found.");
  }

  source = source.replace(
    actionsToken,
    `${actionsToken}            <button className={styles.button} type="button" onClick={() => setDiscoveryModalOpen(true)}>Search settings</button>\n`,
  );
}

if (!source.includes("setDiscoveryModalOpen(false);\n\n      const autoQueued")) {
  source = source.replace(
    "      await loadData(session);\n\n      const autoQueued",
    "      await loadData(session);\n      setDiscoveryModalOpen(false);\n\n      const autoQueued",
  );
}

source = source.replace(discoveryCard, "");

source = source.replace(
  /        <div className=\{styles\.grid\}>\s*<div className=\{styles\.stack\}>/,
  "        <div className={styles.stack}>",
);

const oldTail = "\n          </div>\n        </div>\n      </div>\n    </main>\n  );";
const newTail = "\n        </div>\n      </div>\n    </main>\n  );";
if (source.includes(oldTail)) {
  source = source.replace(oldTail, newTail);
}

if (!source.includes("discoverySearchModalBackdrop")) {
  const modalInsertionToken = "\n      </div>\n    </main>\n  );";
  if (!source.includes(modalInsertionToken)) {
    throw new Error("The Discovery modal render insertion point was not found.");
  }

  const indentedCard = modalCard
    .split("\n")
    .map((line) => `            ${line}`)
    .join("\n");

  const modalMarkup = `
      </div>

      {discoveryModalOpen ? (
        <div
          className="automationProspectModalBackdrop discoverySearchModalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDiscoveryModalOpen(false);
          }}
        >
          <div
            aria-label="Search settings"
            aria-modal="true"
            className="automationProspectModalShell discoverySearchModalShell"
            role="dialog"
          >
            <button
              aria-label="Close pop-up"
              className="automationProspectModalClose"
              onClick={() => setDiscoveryModalOpen(false)}
              type="button"
            >
              Close
            </button>
${indentedCard}
          </div>
        </div>
      ) : null}
    </main>
  );`;

  source = source.replace(modalInsertionToken, modalMarkup);
}

if (!source.includes(">Search settings</button>")) {
  throw new Error("The Search settings modal button was not added.");
}
if (!source.includes("discoverySearchModalBackdrop")) {
  throw new Error("The Discovery search modal markup was not added.");
}
if (source.indexOf(kickerToken) < source.indexOf("discoverySearchModalBackdrop")) {
  throw new Error("The Discovery brief still appears in the normal page flow.");
}

fs.writeFileSync(pageUrl, source);
console.log("Discovery brief converted to a Search settings modal window.");
