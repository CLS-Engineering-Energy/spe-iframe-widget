import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../rdts-playbook/index.html", import.meta.url), "utf8");
const moduleMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(moduleMatch, "inline application module exists");

const engineSource = moduleMatch[1].split("const stepMeta =")[0];
const context = vm.createContext({
  console,
  Date,
  Intl,
  TextEncoder,
  URL,
  Blob,
  setTimeout,
  clearTimeout,
});

vm.runInContext(
  `${engineSource}\n` +
    `globalThis.__rdts = { buildReport, createReportPdfBytes, validateStep, normalizeState, reportFilename };`,
  context,
);

const { buildReport, createReportPdfBytes, reportFilename, validateStep } = context.__rdts;

function scenario(overrides = {}) {
  return {
    ventureName: "Test Venture",
    solutionType: "hybrid",
    buyer: "major",
    problem: "Operators lose production while diagnosing recurring equipment failures.",
    customerEvidence: "quantified",
    decisionPath: "full",
    focus: "sharp",
    commercialCase: "economics",
    technicalProof: "representative",
    commitment: "champion",
    successMetric: "Reduce unplanned downtime by 15% during a 90-day field test.",
    barriers: ["ip", "data", "procurement"],
    resourceNeed: "over250",
    runway: "under3",
    ...overrides,
  };
}

test("uses the earliest unmet evidence gate", () => {
  assert.equal(buildReport(scenario({ customerEvidence: "none" })).phase.id, "discover");
  const report = buildReport(
    scenario({
      commercialCase: "none",
      technicalProof: "operational",
      commitment: "repeat",
    }),
  );
  assert.equal(report.phase.id, "focus");
  assert.match(report.mismatch, /earliest unmet gate/i);
});

test("the complete inline application module parses", () => {
  assert.doesNotThrow(() => new vm.Script(moduleMatch[1]));
});

test("separates free trials from decision-backed commitments", () => {
  assert.equal(buildReport(scenario({ commitment: "free_trial" })).phase.id, "prepare");
  assert.equal(buildReport(scenario({ commitment: "loi" })).phase.id, "convert");
  assert.equal(
    buildReport(
      scenario({
        customerEvidence: "paid",
        commercialCase: "validated",
        technicalProof: "operational",
        commitment: "repeat",
      }),
    ).phase.id,
    "scale",
  );
});

test("requires founder or company runway for every resource path", () => {
  assert.ok(validateStep(scenario({ runway: "" }), 3).runway);
  assert.ok(validateStep(scenario({ runway: "not_needed" }), 3).runway);
  const accessReport = buildReport(scenario({ resourceNeed: "access", runway: "under3" }));
  assert.match(accessReport.funding.now, /protect personal liquidity/i);
  assert.match(accessReport.funding.now, /not an equity round/i);
});

test("adds playbook-v2 commercial, business-plan, community, and runway guidance", () => {
  const report = buildReport(scenario());
  assert.match(report.version, /Playbook v2/);
  assert.match(report.commercialCue.detail, /price|volume|margin/i);
  assert.match(report.businessPlanCue.detail, /living plan|executive summary/i);
  assert.match(report.rdtsSupport, /mentor network/i);
  assert.match(report.funding.now, /two to three times longer/i);
  assert.doesNotMatch(report.disclaimer, /when it becomes available/i);
  assert.ok(report.snapshot.some(([key]) => key === "Market case"));
});

test("generates a compact valid PDF containing the updated guidance", () => {
  const report = buildReport(scenario({ ventureName: "Élan CO₂ / North Sea" }));
  const bytes = createReportPdfBytes(report);
  const pdf = Buffer.from(bytes).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, 2);
  assert.match(pdf, /Market and living business plan/);
  assert.match(pdf, /SPE RDTS ENTREPRENEURSHIP PLAYBOOK V2/i);
  assert.doesNotMatch(pdf, /undefined|CO\?/);
  assert.equal(reportFilename(report), "elan-co2-north-sea-founder-action-brief.pdf");
});

test("keeps maximum-input contradiction briefs complete and two-page", () => {
  const maxProblem = ("Offshore teams lose decision time while reconciling incomplete sensor histories across aging assets, remote environments, weather windows, and spreadsheet handoffs before intervention. " + "Operational constraint ".repeat(8)).slice(0, 220);
  const maxMetric = ("Reduce the intervention decision cycle while meeting the agreed accuracy, safety, reliability, and commercial thresholds. " + "Target evidence").slice(0, 120);
  const report = buildReport(
    scenario({
      ventureName: "Elan CO2 North Sea Demonstration and Commercialization Venture",
      problem: maxProblem,
      customerEvidence: "exploratory",
      decisionPath: "champion_only",
      focus: "one_gap",
      commercialCase: "validated",
      technicalProof: "operational",
      commitment: "paid_pilot",
      successMetric: maxMetric,
      barriers: ["ip", "data", "champion"],
    }),
  );
  const pdf = Buffer.from(createReportPdfBytes(report)).toString("latin1");

  assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, 2);
  assert.match(report.pdfMismatch, /earliest unmet gate is Discover/i);
  assert.match(report.pdfMismatch, /buyer validation lacks matching customer interviews/i);
  assert.match(report.pdfMismatch, /commitment lacks an operational champion/i);
  assert.match(report.pdfMismatch, /paid activity lacks a complete buyer path/i);
  assert.match(report.pdfMismatch, /paid commitment lacks paid customer evidence/i);
  assert.ok(report.pdfVentureName.length <= 44);
  assert.ok(report.pdfOpportunity.includes(maxProblem.trim()));
  assert.ok(report.pdfOpportunity.includes(maxMetric.trim()));
});
