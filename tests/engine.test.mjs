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
    `globalThis.__rdts = { buildReport, createReportPdfBytes, validateStep, normalizeState, reportFilename, createConfiguration, serializeConfiguration, parseConfigurationText, configurationFilename };`,
  context,
);

const {
  buildReport,
  createConfiguration,
  createReportPdfBytes,
  configurationFilename,
  parseConfigurationText,
  reportFilename,
  serializeConfiguration,
  validateStep,
} = context.__rdts;

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

test("adds playbook-v3 commercial, business-plan, community, and runway guidance", () => {
  const report = buildReport(scenario());
  const mappedMarketReport = buildReport(scenario({ commercialCase: "mapped" }));
  assert.match(report.version, /Playbook v3/);
  assert.match(report.commercialCue.detail, /price|volume|margin/i);
  assert.match(mappedMarketReport.commercialCue.detail, /insurance|certification/i);
  assert.match(report.businessPlanCue.detail, /living plan|executive summary/i);
  assert.match(report.businessPlanCue.detail, /quarterly|pilot/i);
  assert.match(report.rdtsSupport, /mentor network/i);
  assert.match(report.funding.now, /two to three times longer/i);
  assert.doesNotMatch(report.disclaimer, /when it becomes available/i);
  assert.match(report.disclaimer, /compliance|risk-management/i);
  assert.match(report.disclaimer, /not reviewed.+Society of Petroleum Engineers/i);
  assert.match(report.disclaimer, /nor is it endorsed by the SPE/i);
  assert.ok(report.snapshot.some(([key]) => key === "Market case"));
});

test("generates a compact valid PDF containing the updated guidance", () => {
  const report = buildReport(scenario({ ventureName: "Élan CO₂ / North Sea" }));
  const bytes = createReportPdfBytes(report);
  const pdf = Buffer.from(bytes).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, 2);
  assert.match(pdf, /Market and living business plan/);
  assert.match(pdf, /SPE RDTS ENTREPRENEURSHIP PLAYBOOK V3/i);
  assert.match(pdf, /not reviewed by the Society of Petroleum Engineers/i);
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

test("round-trips a versioned local configuration without report or acceptance data", () => {
  const now = new Date("2026-09-26T12:00:00.000Z");
  const state = scenario({ ventureName: "Élan CO₂ / North Sea" });
  const configuration = createConfiguration(state, 3, { now });
  const serialized = serializeConfiguration(state, 3, { now });
  const restored = parseConfigurationText(serialized);

  assert.equal(configuration.kind, "spe-rdts-founder-action-brief");
  assert.deepEqual(JSON.parse(JSON.stringify(configuration.schema)), { major: 1, minor: 0 });
  assert.equal(configuration.playbookVersion, "3");
  assert.equal(configuration.savedAt, now.toISOString());
  assert.deepEqual(JSON.parse(JSON.stringify(restored.answers)), state);
  assert.equal(restored.currentStep, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.warnings)), []);
  assert.doesNotMatch(serialized, /disclaimerAccepted|activeReport|rdtsAsk|<script/i);
});

test("accepts partial and legacy configurations conservatively", () => {
  const partial = createConfiguration(
    {
      ventureName: "Partial venture",
      solutionType: "software",
      buyer: "",
      problem: "",
      customerEvidence: "",
      decisionPath: "",
      focus: "",
      commercialCase: "",
      technicalProof: "",
      commitment: "",
      successMetric: "",
      barriers: [],
      resourceNeed: "",
      runway: "not_needed",
    },
    1,
  );
  assert.equal(partial.answers.runway, "");
  assert.equal(parseConfigurationText(JSON.stringify(partial)).answers.buyer, "");

  const legacy = parseConfigurationText(JSON.stringify({
    ventureName: "Legacy venture",
    commitment: "loi_free",
    runway: "not_needed",
    barriers: [],
  }));
  assert.equal(legacy.answers.commitment, "free_trial");
  assert.equal(legacy.answers.runway, "");
  assert.equal(legacy.answers.commercialCase, "");
  assert.match(legacy.warnings[0], /legacy/i);
});

test("validates configuration versions, enums, text, and barriers", () => {
  const base = createConfiguration(scenario(), 4);
  const parse = (value) => parseConfigurationText(JSON.stringify(value));

  assert.throws(() => parse({ ...base, kind: "wrong-kind" }), /not an SPE RDTS/i);
  assert.throws(
    () => parse({ ...base, schema: { major: 2, minor: 0 } }),
    /newer incompatible/i,
  );
  assert.throws(() => parseConfigurationText("not json"), /not valid JSON/i);
  assert.throws(() => parse([]), /not an RDTS configuration object/i);
  assert.throws(() => parse({}), /recognizable RDTS answers/i);
  assert.throws(() => parse({ unrelated: true }), /recognizable RDTS answers/i);
  assert.throws(
    () => parse({ ...base, schema: { major: 1, minor: -1 } }),
    /schema is missing or invalid/i,
  );
  assert.throws(() => parse({ ...base, answers: { ...base.answers, buyer: "invalid" } }), /buyer answer/i);
  assert.throws(
    () => parse({ ...base, answers: { ...base.answers, problem: "x".repeat(221) } }),
    /problem answer is longer/i,
  );
  assert.throws(
    () => parse({ ...base, answers: { ...base.answers, barriers: ["ip", "ip"] } }),
    /same barrier/i,
  );
  assert.throws(
    () => parse({ ...base, answers: { ...base.answers, barriers: ["unknown", "data"] } }),
    /cannot be combined/i,
  );
  assert.throws(
    () => parse({ ...base, answers: { ...base.answers, barriers: ["ip", "data", "hse", "delivery"] } }),
    /no more than three/i,
  );
  assert.throws(
    () => parse({ ...base, answers: { ...base.answers, barriers: "ip" } }),
    /must be a list/i,
  );

  const compatible = parse({
    ...base,
    schema: { major: 1, minor: 3 },
    unknownTopLevel: "ignored",
    answers: { ...base.answers, unknownAnswer: "ignored" },
  });
  assert.match(compatible.warnings[0], /newer compatible/i);
  assert.equal(Object.hasOwn(compatible.answers, "unknownAnswer"), false);
});

test("creates an ASCII-safe configuration filename", () => {
  assert.equal(
    configurationFilename({ ventureName: "Élan CO₂ / North Sea" }),
    "elan-co2-north-sea-rdts-playbook-configuration.json",
  );
});

test("gates the workbook with the disclaimer and keeps local controls in the intended positions", () => {
  assert.match(html, /<section class="guide-shell" id="guide" hidden>/);
  assert.match(html, /<dialog[\s\S]*id="disclaimerDialog"[\s\S]*<input id="disclaimerAcceptance" type="checkbox">[\s\S]*id="disclaimerContinue"[^>]*disabled/);
  assert.match(html, /disclaimerDialog\?\.addEventListener\("cancel", \(event\) => \{\s*event\.preventDefault\(\);/);
  assert.match(html, /startButton\?\.addEventListener[\s\S]*openDisclaimer\(openGuide\)/);
  assert.match(html, /workbookNavLink\?\.addEventListener[\s\S]*openDisclaimer\(openGuide\)/);
  assert.match(html, /if \(params\.get\("embed"\) === "1"\)[\s\S]*openDisclaimer\(openGuide\)/);
  assert.equal((html.match(/class="button[^\"]* download-configuration"/g) || []).length, 2);
  assert.equal((html.match(/class="button[^\"]* load-configuration"/g) || []).length, 2);
  assert.match(html, /<input id="configurationFileInput" type="file" accept="\.json,application\/json" hidden>/);
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
  assert.match(html, /SPE RDTS · September 29, 2026/);
  assert.doesNotMatch(html, /Like As with any endeavor/);
  assert.match(html, /This material was not reviewed by the Society of Petroleum Engineers \(hereafter the SPE\) nor is it endorsed by the SPE\./);
  assert.match(html, /Both the SPE and the Society of Petroleum Engineers’ Research &amp; Development Technical Section/);

  const sidebar = html.match(/<aside class="guide-sidebar"[\s\S]*?<\/aside>/)?.[0] ?? "";
  assert.ok(sidebar.indexOf("sidebar-note") >= 0);
  assert.ok(sidebar.indexOf("sidebar-note") < sidebar.indexOf("sidebar-intro"));
});
