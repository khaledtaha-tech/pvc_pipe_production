/**
 * Acceptance Test Suite for Self-Aware Capability & Scenario Verification System
 * Validates requirements: TEST A through TEST H
 */

import { CapabilityRegistry, registry } from '../../src/verification/capabilityRegistry.js';
import { ScenarioGenerator } from '../../src/verification/scenarioGenerator.js';
import { runner } from '../../src/verification/scenarioRunner.js';
import { evaluateGoldenCases, GOLDEN_CASES } from '../../src/verification/goldenCaseEngine.js';
import { computeCapabilityFingerprint } from '../../src/verification/retestIntelligence.js';
import { SAMPLE_PRODUCTION_DATA } from '../../src/data/sampleData.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName} - ${details}`);
    throw new Error(`Assertion failed: ${testName} - ${details}`);
  }
}

console.log("\n=======================================================");
console.log("🚀 EXECUTING SELF-AWARE VERIFICATION ACCEPTANCE SUITE");
console.log("=======================================================\n");

// -----------------------------------------------------------------------------
// TEST A: An existing capability appears in the generated verification plan.
// -----------------------------------------------------------------------------
console.log("▶️ Running TEST A: Existing Capability Appears in Generated Plan...");
const generatorA = new ScenarioGenerator(registry);
const planA = generatorA.generatePlan();

const hasDimExtract = planA.scenarios.some(sc => sc.capabilitiesCovered.includes("CAP-DIM-EXTRACT"));
const hasMathAudit = planA.scenarios.some(sc => sc.capabilitiesCovered.includes("CAP-MATH-AUDIT"));
const hasHours = planA.scenarios.some(sc => sc.capabilitiesCovered.includes("CAP-HRS-DOWNTIME"));

assert(hasDimExtract, "TEST A.1: CAP-DIM-EXTRACT generates operational scenarios in plan", `Count: ${planA.scenarios.length}`);
assert(hasMathAudit, "TEST A.2: CAP-MATH-AUDIT generates operational scenarios in plan");
assert(hasHours, "TEST A.3: CAP-HRS-DOWNTIME generates operational scenarios in plan");

// -----------------------------------------------------------------------------
// TEST B: Adding a sample registered capability causes a new scenario to appear
//         WITHOUT manually editing the checklist.
// -----------------------------------------------------------------------------
console.log("\n▶️ Running TEST B: Dynamic Registration Generates Scenarios Without Manual Checklist Editing...");
const customRegistry = new CapabilityRegistry();

// Register existing capability
customRegistry.register(registry.get("CAP-DIM-EXTRACT"));

const initialPlan = new ScenarioGenerator(customRegistry).generatePlan();
const initialScenarioCount = initialPlan.scenarios.length;

// Now register a brand new capability dynamically at runtime
customRegistry.register({
  capabilityId: "CAP-URGENT-ORDER",
  name: "Urgent Production Order Insertion",
  description: "Allows high-priority production orders to preempt standard schedule queue.",
  businessPurpose: "Fulfill urgent municipal emergency repair requests without plant stoppage.",
  userActions: ["Open order manager", "Tag order as Urgent", "Confirm line assignment"],
  inputs: [{ field: "orderPriority", type: "string", example: "URGENT" }],
  possibleStates: [
    { stateId: "NORMAL_INSERTION", label: "Preempts next scheduled order" },
    { stateId: "LINE_CONFLICT", label: "Selected extruder lacks tooling" }
  ],
  dependencies: [],
  affectedModules: ["scheduleManager"],
  affectedViews: ["ScheduleView"],
  businessRules: [{ ruleId: "RULE-URG-01", description: "Urgent order moves to index 0 of pending queue." }],
  invariants: ["Total queue length increases by 1."],
  expectedEffects: ["Pending schedule shifts by order duration."],
  edgeCases: [{ caseId: "EDGE-URG-01", description: "Zero remaining daily capacity", input: { capacity: 0 } }],
  verificationPriority: "HIGH"
});

const updatedPlan = new ScenarioGenerator(customRegistry).generatePlan();
const updatedScenarios = updatedPlan.scenarios.filter(s => s.capabilitiesCovered.includes("CAP-URGENT-ORDER"));

assert(updatedPlan.scenarios.length > initialScenarioCount, "TEST B.1: Plan scenario count increased dynamically after capability registration", `Old: ${initialScenarioCount}, New: ${updatedPlan.scenarios.length}`);
assert(updatedScenarios.length >= 2, "TEST B.2: New capability generated at least 2 distinct operational scenarios", `Generated: ${updatedScenarios.length}`);
assert(updatedScenarios.some(s => s.id.includes("CAP-URGENT-ORDER-NORMAL_INSERTION")), "TEST B.3: Generated specific scenario for state NORMAL_INSERTION without manual checklist edit");

// -----------------------------------------------------------------------------
// TEST C: A registered capability with missing verification metadata appears as:
//         Verification Coverage Missing / Scenario Definition Incomplete.
// -----------------------------------------------------------------------------
console.log("\n▶️ Running TEST C: Verification Coverage Missing Detection...");
const testRegistryC = new CapabilityRegistry();

// Register a capability that lacks required verification metadata (no invariants, no rules, no edge cases, no expectedEffects)
testRegistryC.register({
  capabilityId: "CAP-INCOMPLETE-FEATURE",
  name: "Experimental Raw Material Tracer",
  description: "Draft capability under active development.",
  userActions: ["Click trace button"],
  inputs: []
  // Deliberately missing: businessPurpose, possibleStates, businessRules, invariants, expectedEffects, edgeCases
});

const coverageReportC = testRegistryC.getCoverageReport();
const uncoveredItem = coverageReportC.uncovered.find(c => c.capabilityId === "CAP-INCOMPLETE-FEATURE");

assert(coverageReportC.uncoveredCount >= 1, "TEST C.1: Incomplete capability detected as UNCOVERED");
assert(uncoveredItem !== undefined, "TEST C.2: Incomplete capability present in uncovered list");
assert(uncoveredItem.statusMessage === "⚠️ Verification Coverage Missing", "TEST C.3: Displays exact status label '⚠️ Verification Coverage Missing'");
assert(uncoveredItem.missingFields.length >= 4, "TEST C.4: Accurately reports missing metadata fields", `Missing: ${uncoveredItem.missingFields.join(', ')}`);

// -----------------------------------------------------------------------------
// TEST D: Two meaningfully dependent capabilities generate an interaction scenario.
// -----------------------------------------------------------------------------
console.log("\n▶️ Running TEST D: Meaningful Dependency Interaction Generation...");
const interactionScenarios = planA.scenarios.filter(s => s.scenarioCategory === "INTERACTION");

const mathScrapInteraction = interactionScenarios.find(s => 
  s.capabilitiesCovered.includes("CAP-MATH-AUDIT") && s.capabilitiesCovered.includes("CAP-SCRAP-AUDIT")
);

const hoursKpiInteraction = interactionScenarios.find(s => 
  s.capabilitiesCovered.includes("CAP-HRS-DOWNTIME") && s.capabilitiesCovered.includes("CAP-KPI-AGGREGATION")
);

assert(mathScrapInteraction !== undefined, "TEST D.1: Auto-generated interaction scenario for CAP-MATH-AUDIT + CAP-SCRAP-AUDIT");
assert(hoursKpiInteraction !== undefined, "TEST D.2: Auto-generated interaction scenario for CAP-HRS-DOWNTIME + CAP-KPI-AGGREGATION");
assert(mathScrapInteraction.executionSteps.length >= 3, "TEST D.3: Interaction scenario provides step-by-step cross-capability flow");

// -----------------------------------------------------------------------------
// TEST E: Two unrelated capabilities do NOT generate unnecessary combination scenarios.
// -----------------------------------------------------------------------------
console.log("\n▶️ Running TEST E: Unrelated Capabilities Do Not Explode Combinations...");
// CAP-SHEET-TARGET and CAP-MANUAL-ENTRY are unrelated and should NOT have a combinatorial cross scenario
const unrelatedCombo = planA.scenarios.find(s => 
  s.capabilitiesCovered.includes("CAP-SHEET-TARGET") && s.capabilitiesCovered.includes("CAP-MANUAL-ENTRY")
);

assert(unrelatedCombo === undefined, "TEST E.1: Unrelated capabilities (CAP-SHEET-TARGET & CAP-MANUAL-ENTRY) do NOT produce senseless combination scenarios");
assert(planA.totalScenarios >= 15 && planA.totalScenarios <= 70, "TEST E.2: Practical scenario count maintained (bounded set of high-value scenarios)", `Count: ${planA.totalScenarios}`);

// -----------------------------------------------------------------------------
// TEST F: A Golden Case with deliberately altered production output is detected as a mismatch.
// -----------------------------------------------------------------------------
console.log("\n▶️ Running TEST F: Golden Case Engine & Fault Detection...");
// 1. Evaluate production logic -> must pass all golden benchmarks
const goldenEvalNormal = evaluateGoldenCases();
assert(goldenEvalNormal.allPassed === true, "TEST F.1: Production logic passes 100% of deterministic Golden Cases", `Passed: ${goldenEvalNormal.passedCount}/${goldenEvalNormal.totalGoldenCases}`);

// 2. Deliberately simulate a faulty runner that introduces an error into diameter extraction
const faultyRunner = (gc) => {
  if (gc.id === "GOLDEN-DIM-01") {
    // Return wrong diameter!
    return { diameter: "90 mm", thickness: "5.3 mm" };
  }
  if (gc.id === "GOLDEN-MATH-01") {
    // Return wrong total weight!
    return { calculatedTotalWeight: 9999.00 };
  }
  // Fall back to normal for others
  return gc.independentExpected;
};

const goldenEvalFaulty = evaluateGoldenCases(faultyRunner);
assert(goldenEvalFaulty.allPassed === false, "TEST F.2: Golden Case Engine successfully caught deliberate production logic tampering");
assert(goldenEvalFaulty.failedCount >= 2, "TEST F.3: Detected at least 2 tampered test fixtures");

const failedCaseDim = goldenEvalFaulty.results.find(r => r.goldenCaseId === "GOLDEN-DIM-01");
assert(failedCaseDim.passed === false, "TEST F.4: GOLDEN-DIM-01 correctly identified as failed");
assert(failedCaseDim.failureReason.includes("Expected \"110 mm\", but received \"90 mm\""), "TEST F.5: Captured exact mismatch diagnostics: " + failedCaseDim.failureReason);

// -----------------------------------------------------------------------------
// TEST G: Manual scenario status persists after reload.
// -----------------------------------------------------------------------------
console.log("\n▶️ Running TEST G: Retest Intelligence & Status Persistence...");
// Mock localStorage in Node environment
const mockStorage = {};
global.window = {
  localStorage: {
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; }
  }
};

const scenarioToPersist = planA.scenarios[0];
const testNotes = "Verified physically on Extruder line 1 by Lead Operator Khaled.";

// Import dynamically functions that use window.localStorage
import('../../src/verification/retestIntelligence.js').then(({ saveScenarioUpdate, loadStoredProgress, applyRetestIntelligence }) => {
  saveScenarioUpdate(scenarioToPersist.id, {
    status: "PASSED",
    notes: testNotes
  });

  const stored = loadStoredProgress();
  assert(stored.scenarios[scenarioToPersist.id] !== undefined, "TEST G.1: Stored scenario record exists in persistent storage");
  assert(stored.scenarios[scenarioToPersist.id].status === "PASSED", "TEST G.2: Stored status 'PASSED' accurately retained");
  assert(stored.scenarios[scenarioToPersist.id].notes === testNotes, "TEST G.3: Stored operator notes accurately retained");

  const restoredPlan = applyRetestIntelligence(planA);
  const reloadedScenario = restoredPlan.scenarios.find(s => s.id === scenarioToPersist.id);
  assert(reloadedScenario.status === "PASSED", "TEST G.4: Re-applied plan restores PASSED status on reloaded scenario");
  assert(reloadedScenario.userNotes === testNotes, "TEST G.5: Re-applied plan restores user notes on reloaded scenario");

  // -----------------------------------------------------------------------------
  // TEST H: Verification test data does not alter real production/business data.
  // -----------------------------------------------------------------------------
  console.log("\n▶️ Running TEST H: Test Data Isolation & Non-Destructive Safety...");
  const initialDataSnapshot = JSON.stringify(SAMPLE_PRODUCTION_DATA);

  // Execute all automated scenarios in the plan
  const autoSummary = runner.runAllAutomated(planA);
  assert(autoSummary.totalExecuted > 0, "TEST H.1: Automated runner executed scenarios in sandbox", `Executed: ${autoSummary.totalExecuted}`);

  const postRunSnapshot = JSON.stringify(SAMPLE_PRODUCTION_DATA);
  assert(initialDataSnapshot === postRunSnapshot, "TEST H.2: Real production data was 100% untouched and unmodified during verification");
  assert(SAMPLE_PRODUCTION_DATA.length === 19, "TEST H.3: Sample production record length remains exactly 19");

  console.log("\n=======================================================");
  console.log(`🎉 ALL ACCEPTANCE TESTS COMPLETED SUCCESSFULLY! (${passedTests}/${totalTests})`);
  console.log("=======================================================\n");
});
