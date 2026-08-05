import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

function extractCardByKicker(kicker) {
  const kickerToken = `<p className={styles.kicker}>${kicker}</p>`;
  const kickerIndex = source.indexOf(kickerToken);
  if (kickerIndex === -1) throw new Error(`${kicker} card heading was not found.`);

  const cardStartToken = "            <section className={styles.card}>";
  const cardStart = source.lastIndexOf(cardStartToken, kickerIndex);
  if (cardStart === -1) throw new Error(`${kicker} card start was not found.`);

  const cardEndToken = "\n            </section>";
  const cardEndStart = source.indexOf(cardEndToken, kickerIndex);
  if (cardEndStart === -1) throw new Error(`${kicker} card ending was not found.`);

  return source.slice(cardStart, cardEndStart + cardEndToken.length);
}

function modalizeCard(block) {
  return block
    .trim()
    .replace(
      "<section className={styles.card}>",
      '<section className={`${styles.card} automationProspectModalCard`}>',
    );
}

if (!source.includes('const [prospectModal, setProspectModal]')) {
  const stateToken = "  const [revisionText, setRevisionText] = useState<Record<string, string>>({});\n";
  if (!source.includes(stateToken)) throw new Error("Prospect modal state insertion point was not found.");
  source = source.replace(
    stateToken,
    `${stateToken}  const [prospectModal, setProspectModal] = useState<"single" | "list" | null>(null);\n`,
  );
}

if (!source.includes("document.body.style.overflow = \"hidden\"")) {
  const effectInsertionToken = "  const activeRun = useMemo(\n";
  if (!source.includes(effectInsertionToken)) throw new Error("Prospect modal effect insertion point was not found.");

  const modalEffect = `  useEffect(() => {
    if (!prospectModal) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setProspectModal(null);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [prospectModal]);

`;

  source = source.replace(effectInsertionToken, `${modalEffect}${effectInsertionToken}`);
}

if (!source.includes('setProspectModal("single")')) {
  const checkButtonText = ">Check domain & continue</button>";
  const checkButtonIndex = source.indexOf(checkButtonText);
  if (checkButtonIndex === -1) throw new Error("Check domain button was not found.");
  const checkButtonLineStart = source.lastIndexOf("\n", checkButtonIndex) + 1;
  const modalButtons = `            <button className={styles.buttonSecondary} type="button" onClick={() => setProspectModal("single")}>Add one PI</button>
            <button className={styles.buttonSecondary} type="button" onClick={() => setProspectModal("list")}>Paste prospect list</button>
`;
  source = `${source.slice(0, checkButtonLineStart)}${modalButtons}${source.slice(checkButtonLineStart)}`;
}

source = source.replace(
  "      setForm(blankForm());\n",
  "      setForm(blankForm());\n      setProspectModal(null);\n",
);
source = source.replace(
  "      setQuickList(\"\");\n",
  "      setQuickList(\"\");\n      setProspectModal(null);\n",
);

if (!source.includes("automationProspectModalBackdrop")) {
  const singleCard = extractCardByKicker("Prospect intake");
  const listCard = extractCardByKicker("Fast import");
  const singleModalCard = modalizeCard(singleCard);
  const listModalCard = modalizeCard(listCard);

  source = source.replace(singleCard, "");
  source = source.replace(listCard, "");

  const modalInsertionToken = "\n      </div>\n    </main>\n  );";
  if (!source.includes(modalInsertionToken)) throw new Error("Prospect modal render insertion point was not found.");

  const modalMarkup = `
      </div>

      {prospectModal ? (
        <div
          className="automationProspectModalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProspectModal(null);
          }}
        >
          <div
            aria-label={prospectModal === "single" ? "Add one PI" : "Paste a prospect list"}
            aria-modal="true"
            className="automationProspectModalShell"
            role="dialog"
          >
            <button
              aria-label="Close pop-up"
              className="automationProspectModalClose"
              onClick={() => setProspectModal(null)}
              type="button"
            >
              Close
            </button>
            {prospectModal === "single" ? (
${singleModalCard.split("\n").map((line) => `              ${line}`).join("\n")}
            ) : (
${listModalCard.split("\n").map((line) => `              ${line}`).join("\n")}
            )}
          </div>
        </div>
      ) : null}
    </main>
  );`;

  source = source.replace(modalInsertionToken, modalMarkup);
}

if (!source.includes("automationProspectModalBackdrop")) {
  throw new Error("Prospect modal markup was not added.");
}
if (source.includes("<p className={styles.kicker}>Prospect intake</p>\n              <form") && !source.includes("automationProspectModalCard")) {
  throw new Error("Prospect intake was not moved into a modal.");
}

fs.writeFileSync(pageUrl, source);
console.log("Prospect intake and quick import converted to modal windows.");
