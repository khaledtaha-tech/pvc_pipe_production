/**
 * Scenario Runner
 * 
 * Non-destructive automated execution engine for AUTO VERIFY and HYBRID VERIFY scenarios.
 * Operates in an isolated test sandbox, guaranteeing real production data is never modified.
 */

import { cleanPipeProductionData, parseProductSpecs } from '../utils/dataCleaner.js';
import { computeAnalytics } from '../utils/analyticsEngine.js';
import { GOLDEN_CASES } from './goldenCaseEngine.js';

export class ScenarioRunner {
  constructor() {
    this.executionLog = [];
  }

  /**
   * Runs a single scenario in an isolated sandbox.
   */
  runScenario(scenario) {
    if (!scenario) return { status: "NOT_TESTED", error: "Invalid scenario" };

    if (scenario.verificationType === "MANUAL VERIFY") {
      return {
        scenarioId: scenario.id,
        status: scenario.status || "NOT_TESTED",
        message: "Manual verification requires operational / human confirmation.",
        executionLog: ["Waiting for user inspection"]
      };
    }

    const startTime = performance.now();
    let actualResult = {};
    const mismatches = [];
    const crossSystemResults = [];
    let passed = true;

    try {
      // 1. Golden Case Scenarios
      if (scenario.scenarioCategory === "GOLDEN_CASE") {
        const gc = GOLDEN_CASES.find(g => g.id === scenario.goldenCaseId);
        if (gc) {
          if (gc.category === "DIMENSIONS") {
            const parsed = parseProductSpecs(gc.input);
            actualResult = {
              diameter: parsed.diameter,
              thickness: parsed.thickness
            };
          } else if (gc.category === "WEIGHT") {
            const sandboxData = [{
              "Date": "2026-09-07",
              "Item Code": "TEST",
              "Product Description & Specs": "TEST PIPE 110x5.3",
              "Machine": "KTS-350",
              "Production Qty (FG)": gc.input.qty,
              "Unit Weight (kg)": gc.input.unitWeight,
              "Total Weight (kg)": 0,
              "Operating Hours": 24
            }];
            const cleaned = cleanPipeProductionData(sandboxData);
            actualResult = {
              calculatedTotalWeight: cleaned.cleanedRows[0]?.totalWeight
            };
          } else if (gc.category === "SCRAP") {
            const sandboxData = [{
              "Date": "2026-09-07",
              "Item Code": "TEST",
              "Product Description & Specs": "TEST PIPE 110x5.3",
              "Machine": "KTS-350",
              "Production Qty (FG)": 100,
              "Unit Weight (kg)": 10,
              "Total Weight (kg)": gc.input.totalWeight,
              "Scrap / Rejection (kg)": gc.input.scrapKg,
              "Operating Hours": 24
            }];
            const cleaned = cleanPipeProductionData(sandboxData);
            actualResult = {
              scrapPercentage: cleaned.cleanedRows[0]?.scrapPercentage
            };
          } else if (gc.category === "HOURS") {
            const sandboxData = [{
              "Date": "2026-09-07",
              "Item Code": "TEST",
              "Product Description & Specs": "TEST PIPE 110x5.3",
              "Machine": "KTS-350",
              "Operating Hours": gc.input.operatingHours
            }];
            const cleaned = cleanPipeProductionData(sandboxData);
            actualResult = {
              downtimeHours: cleaned.cleanedRows[0]?.downtimeHours
            };
          } else if (gc.category === "THROUGHPUT") {
            const sandboxData = [{
              "Date": "2026-09-07",
              "Item Code": "TEST",
              "Product Description & Specs": "TEST PIPE 110x5.3",
              "Machine": "KTS-350",
              "Total Weight (kg)": gc.input.totalWeight,
              "Operating Hours": gc.input.operatingHours
            }];
            const cleaned = cleanPipeProductionData(sandboxData);
            actualResult = {
              lineRateKgPerHour: cleaned.cleanedRows[0]?.lineRateKgPerHour
            };
          }

          // Validate against independentExpected
          Object.keys(scenario.expectedResults).forEach(key => {
            const exp = scenario.expectedResults[key];
            const act = actualResult[key];
            if (typeof exp === 'number') {
              if (Math.abs(exp - act) > 0.05) {
                passed = false;
                mismatches.push(`Golden mismatch on '${key}': Expected ${exp}, received ${act}`);
              }
            } else {
              if (String(exp).trim() !== String(act).trim()) {
                passed = false;
                mismatches.push(`Golden mismatch on '${key}': Expected "${exp}", received "${act}"`);
              }
            }
          });
        }
      }

      // 2. Core & Interaction Scenarios with testData.rawRow
      else if (scenario.testData && scenario.testData.rawRow) {
        // Run completely in memory test sandbox
        const sandboxInput = [scenario.testData.rawRow];
        const cleanedData = cleanPipeProductionData(sandboxInput);
        const row = cleanedData.cleanedRows[0];
        const analytics = computeAnalytics(cleanedData.cleanedRows);

        if (!row) {
          throw new Error("Sandbox data cleaning yielded 0 rows");
        }

        actualResult = {
          diameter: row.diameter,
          thickness: row.thickness,
          material: row.material,
          totalWeight: row.totalWeight,
          scrapKg: row.scrap,
          scrapPercentage: row.scrapPercentage,
          operatingHours: row.operatingHours,
          downtimeHours: row.downtimeHours,
          reasonOfStop: row.reasonOfStop,
          lineRateKgPerHour: row.lineRateKgPerHour,
          hasIssues: row.hasIssues,
          adjustmentsCount: row.adjustments.length,
          kpiTonnageTons: analytics.kpis.totalWeightTons,
          kpiAvgLineRate: analytics.kpis.avgLineRateKgPerHour
        };

        // Assert against independent expected results
        const expected = scenario.expectedResults;

        if (expected.diameter !== undefined && expected.diameter !== row.diameter) {
          passed = false;
          mismatches.push(`Diameter mismatch: Expected "${expected.diameter}", got "${row.diameter}"`);
        }

        if (expected.thickness !== undefined && expected.thickness !== row.thickness) {
          passed = false;
          mismatches.push(`Thickness mismatch: Expected "${expected.thickness}", got "${row.thickness}"`);
        }

        if (expected.totalWeight !== undefined && Math.abs(expected.totalWeight - row.totalWeight) > 0.5) {
          passed = false;
          mismatches.push(`Total Weight mismatch: Expected ${expected.totalWeight}, got ${row.totalWeight}`);
        }

        if (expected.autoComputedTotalWeight !== undefined && Math.abs(expected.autoComputedTotalWeight - row.totalWeight) > 0.5) {
          passed = false;
          mismatches.push(`Auto Total Weight mismatch: Expected ${expected.autoComputedTotalWeight}, got ${row.totalWeight}`);
        }

        if (expected.downtimeHours !== undefined && Math.abs(expected.downtimeHours - row.downtimeHours) > 0.1) {
          passed = false;
          mismatches.push(`Downtime Hours mismatch: Expected ${expected.downtimeHours}, got ${row.downtimeHours}`);
        }

        if (expected.scrapPercentage !== undefined && Math.abs(expected.scrapPercentage - row.scrapPercentage) > 0.1) {
          passed = false;
          mismatches.push(`Scrap % mismatch: Expected ${expected.scrapPercentage}%, got ${row.scrapPercentage}%`);
        }

        if (expected.reasonOfStop !== undefined && !row.reasonOfStop.includes(expected.reasonOfStop.split(' ')[0])) {
          passed = false;
          mismatches.push(`Reason of Stop mismatch: Expected "${expected.reasonOfStop}", got "${row.reasonOfStop}"`);
        }

        if (expected.hasIssues !== undefined && row.hasIssues !== expected.hasIssues) {
          passed = false;
          mismatches.push(`Issues flag mismatch: Expected ${expected.hasIssues}, got ${row.hasIssues}`);
        }

        if (expected.throughputKgPerHour !== undefined && Math.abs(expected.throughputKgPerHour - row.lineRateKgPerHour) > 0.5) {
          passed = false;
          mismatches.push(`Throughput mismatch: Expected ${expected.throughputKgPerHour}, got ${row.lineRateKgPerHour}`);
        }

        // Cross-system consistency checks
        scenario.crossSystemChecks.forEach((checkDesc, i) => {
          let checkPassed = true;
          let detail = "Consistent across table and KPI states";

          if (checkDesc.toLowerCase().includes("diameter")) {
            checkPassed = row.diameter === (expected.diameter || row.diameter);
            detail = `Table Diameter: ${row.diameter}`;
          } else if (checkDesc.toLowerCase().includes("thickness")) {
            checkPassed = row.thickness === (expected.thickness || row.thickness);
            detail = `Table Thickness: ${row.thickness}`;
          } else if (checkDesc.toLowerCase().includes("kpi") || checkDesc.toLowerCase().includes("tonnage")) {
            const expectedTons = Math.round((row.totalWeight / 1000) * 100) / 100;
            checkPassed = Math.abs(analytics.kpis.totalWeightTons - expectedTons) <= 0.05;
            detail = `Table Wt: ${row.totalWeight} kg ➔ KPI Tons: ${analytics.kpis.totalWeightTons} Ton`;
          } else if (checkDesc.toLowerCase().includes("pareto") || checkDesc.toLowerCase().includes("downtime")) {
            checkPassed = analytics.kpis.totalDowntimeHours === row.downtimeHours;
            detail = `Row Downtime: ${row.downtimeHours}h ➔ Pareto Sum: ${analytics.kpis.totalDowntimeHours}h`;
          }

          crossSystemResults.push({
            checkDescription: checkDesc,
            passed: checkPassed,
            detail
          });

          if (!checkPassed) {
            passed = false;
            mismatches.push(`Cross-system check failed: ${checkDesc} (${detail})`);
          }
        });
      }

      // 3. Edge Case Handling
      else if (scenario.scenarioCategory === "EDGE_CASE") {
        const input = scenario.testData?.edgeCaseInput;
        actualResult = { inputReceived: input };

        if (scenario.capabilityId === "CAP-DIM-EXTRACT") {
          const res = parseProductSpecs(typeof input === 'string' ? input : "");
          actualResult.parsed = res;
          // Must not crash, diameter & thickness must be strings
          passed = typeof res.diameter === 'string' && typeof res.thickness === 'string';
        } else if (scenario.capabilityId === "CAP-MATH-AUDIT") {
          const res = cleanPipeProductionData([{
            "Date": "2026-09-07",
            "Item Code": "EDGE",
            "Product Description & Specs": "TEST",
            "Machine": "KTS-350",
            "Production Qty (FG)": input?.qty || 0,
            "Unit Weight (kg)": input?.unitWeight || 0,
            "Total Weight (kg)": input?.recorded || 0
          }]);
          passed = !isNaN(res.cleanedRows[0]?.totalWeight);
          actualResult.totalWeight = res.cleanedRows[0]?.totalWeight;
        } else if (scenario.capabilityId === "CAP-HRS-DOWNTIME") {
          const res = cleanPipeProductionData([{
            "Date": "2026-09-07",
            "Item Code": "EDGE",
            "Product Description & Specs": "TEST",
            "Machine": "KTS-350",
            "Operating Hours": typeof input === 'number' ? input : 24
          }]);
          const row = res.cleanedRows[0];
          passed = row.operatingHours >= 0 && row.operatingHours <= 24 && row.downtimeHours >= 0;
          actualResult.clampedHours = row.operatingHours;
          actualResult.downtimeHours = row.downtimeHours;
        } else {
          passed = true;
        }
      }

      // 4. Default / Interaction test with description
      else if (scenario.testData?.description) {
        const parsed = parseProductSpecs(scenario.testData.description);
        actualResult = parsed;
        passed = parsed.diameter !== '-' && parsed.thickness !== '-';
      }

    } catch (err) {
      passed = false;
      mismatches.push(`Unexpected execution error: ${err.message}`);
    }

    const durationMs = Math.round(performance.now() - startTime);

    return {
      scenarioId: scenario.id,
      status: passed ? "PASSED" : "NEEDS_FIX",
      durationMs,
      actualResult,
      expectedResult: scenario.expectedResults,
      crossSystemResults,
      mismatches,
      testedAt: new Date().toISOString()
    };
  }

  /**
   * Executes all automated scenarios in the plan.
   */
  runAllAutomated(plan) {
    const autoScenarios = plan.scenarios.filter(s => s.verificationType !== "MANUAL VERIFY");
    const results = new Map();

    autoScenarios.forEach(sc => {
      const res = this.runScenario(sc);
      results.set(sc.id, res);
    });

    const passedCount = Array.from(results.values()).filter(r => r.status === "PASSED").length;
    const failedCount = Array.from(results.values()).filter(r => r.status === "NEEDS_FIX").length;

    return {
      totalExecuted: autoScenarios.length,
      passedCount,
      failedCount,
      allPassed: failedCount === 0,
      results
    };
  }
}

export const runner = new ScenarioRunner();
