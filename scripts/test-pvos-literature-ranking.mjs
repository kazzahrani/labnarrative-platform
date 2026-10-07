import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeArticle, productTerms } from "../pvos-app/app/api/pvos/literature/_pubmed.ts";
import { refineRanking } from "../pvos-app/app/api/pvos/literature/_rank.ts";

const terms = productTerms({ id: "test", brand_name: "DapaMet", active_ingredient: "Dapagliflozin & metformin hydrochloride" });
const rank = (title, abstract) => refineRanking(analyzeArticle(title, abstract, [], terms), title, abstract, terms);

// Regression from DOI 10.1515/jpem-2026-0161; human screening remains separate.
const title = "Successful treatment of metformin-associated lactic acidosis without hemodialysis.";
const abstract = "OBJECTIVES: Metformin-associated lactic acidosis (MALA) is a rare but potentially life-threatening condition. CASE PRESENTATION: We report a girl with chronic kidney disease who developed MALA after 18 months of metformin, insulin, and sodium bicarbonate therapy. She was referred to our hospital with acute kidney injury and MALA. CONCLUSIONS: This report describes pediatric MALA managed without renal replacement therapy.";
const caseResult = rank(title, abstract);
assert.equal(caseResult.relevance, "likely_relevant", "explicit metformin MALA case must not be classified Unlikely");
assert.ok(caseResult.findingTypes.includes("safety"));
assert.ok(caseResult.productSafetyHits.includes("lactic acidosis"));
assert.equal(caseResult.productRole, "subject");

assert.equal(rank(title, "").relevance, "possible", "missing abstracts still require source review");
assert.equal(rank(title, "").fullTextRequired, true);
assert.equal(rank("Metformin treatment and glycemic control", "Patients treated with metformin showed improved glycemic control.").relevance, "unlikely", "beneficial efficacy alone is not a safety finding");
assert.equal(rank("Metformin and lactic acidosis in a rat model", "Rats treated with metformin developed lactic acidosis in an animal model.").relevance, "possible", "animal safety remains distinct from human evidence");
assert.equal(rank("Removing metformin from wastewater", "Metformin adsorption and removal from wastewater were evaluated in soil samples.").relevance, "unlikely");
for (const name of ["_pubmed.ts", "_rank.ts"]) {
  assert.equal(
    readFileSync(new URL("../pvos-app/app/api/pvos/literature/" + name, import.meta.url), "utf8"),
    readFileSync(new URL("../supabase/functions/pvos-daily-literature/" + name, import.meta.url), "utf8"),
    "manual and automatic ranking must remain identical: " + name
  );
}
console.log("Literature ranking: 5 regression scenarios passed.");
