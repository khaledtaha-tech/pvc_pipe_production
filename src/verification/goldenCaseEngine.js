/**
 * Golden Case Engine
 * 
 * Provides deterministic Golden Cases with INDEPENDENT expected outputs.
 * Expected values are derived from independent standards and analytical formulas,
 * NEVER by simply delegating to the production function being evaluated.
 */

import { parseProductSpecs, cleanPipeProductionData } from '../utils/dataCleaner.js';

export const GOLDEN_CASES = [
  {
    id: "GOLDEN-DIM-01",
    name: "Metric Cross Notation Verification",
    capabilityId: "CAP-DIM-EXTRACT",
    category: "DIMENSIONS",
    input: "uPVC PIPE 110x5.3 PN-12.5 SASO-ISO",
    independentExpected: {
      diameter: "110 mm",
      thickness: "5.3 mm"
    },
    referenceStandard: "ISO 1452 / SASO 14-15"
  },
  {
    id: "GOLDEN-DIM-02",
    name: "Imperial Diameter with SDR Verification",
    capabilityId: "CAP-DIM-EXTRACT",
    category: "DIMENSIONS",
    input: "PVC 4\" PIPE SDR 26 ASTMD 2241",
    independentExpected: {
      diameter: '4"',
      thickness: "SDR 26"
    },
    referenceStandard: "ASTM D2241"
  },
  {
    id: "GOLDEN-DIM-03",
    name: "Metric Diameter with Separate MM Thickness",
    capabilityId: "CAP-DIM-EXTRACT",
    category: "DIMENSIONS",
    input: "uPVC PIPE 75MM PN10X3.6MM SASO-ISO",
    independentExpected: {
      diameter: "75 mm",
      thickness: "3.6 mm"
    },
    referenceStandard: "DIN 8062"
  },
  {
    id: "GOLDEN-DIM-04",
    name: "Fractional Imperial with Schedule 40 Compact",
    capabilityId: "CAP-DIM-EXTRACT",
    category: "DIMENSIONS",
    input: "PVC PIPE 3/4\"SCH40",
    independentExpected: {
      diameter: '3/4"',
      thickness: "SCH 40"
    },
    referenceStandard: "ASTM D1785"
  },
  {
    id: "GOLDEN-DIM-05",
    name: "Metric Thin Wall Drainage Spec",
    capabilityId: "CAP-DIM-EXTRACT",
    category: "DIMENSIONS",
    input: "uPVC PIPE 75MM 2.2MM GRAY PN-6",
    independentExpected: {
      diameter: "75 mm",
      thickness: "2.2 mm"
    },
    referenceStandard: "BS EN 1401"
  },
  {
    id: "GOLDEN-DIM-06",
    name: "Imperial Integer with Spaced Schedule",
    capabilityId: "CAP-DIM-EXTRACT",
    category: "DIMENSIONS",
    input: "MANARCO PVC PIPE 3\" SCH 40 ASTM",
    independentExpected: {
      diameter: '3"',
      thickness: "SCH 40"
    },
    referenceStandard: "ASTM D1785"
  },
  {
    id: "GOLDEN-MATH-01",
    name: "Deterministic Total Weight Calculation",
    capabilityId: "CAP-MATH-AUDIT",
    category: "WEIGHT",
    input: { qty: 700, unitWeight: 8.20 },
    // Independent formula: 700 * 8.20 = 5740.00
    independentExpected: {
      calculatedTotalWeight: 5740.00
    },
    referenceStandard: "Mathematical multiplication: Qty * UnitWeight"
  },
  {
    id: "GOLDEN-SCRAP-01",
    name: "Scrap Percentage Analytical Derivation",
    capabilityId: "CAP-SCRAP-AUDIT",
    category: "SCRAP",
    input: { totalWeight: 2240.00, scrapKg: 40.00 },
    // Independent formula: (40 / (2240 + 40)) * 100 = 40 / 2280 * 100 = 1.75438... -> 1.75%
    independentExpected: {
      scrapPercentage: 1.75
    },
    referenceStandard: "Factory Compounding Yield Formula"
  },
  {
    id: "GOLDEN-HOURS-01",
    name: "Downtime Derivation from 24h Capacity",
    capabilityId: "CAP-HRS-DOWNTIME",
    category: "HOURS",
    input: { operatingHours: 11.00 },
    // Independent formula: 24.00 - 11.00 = 13.00
    independentExpected: {
      downtimeHours: 13.00
    },
    referenceStandard: "OEE Continuous Operation Baseline (24h calendar schedule)"
  },
  {
    id: "GOLDEN-RATE-01",
    name: "Extruder Throughput Rate (kg/hr)",
    capabilityId: "CAP-KPI-AGGREGATION",
    category: "THROUGHPUT",
    input: { totalWeight: 7168.00, operatingHours: 24.00 },
    // Independent formula: 7168 / 24 = 298.666... -> 298.7 kg/hr
    independentExpected: {
      lineRateKgPerHour: 298.7
    },
    referenceStandard: "Extrusion Line Specific Output Rate"
  }
];

/**
 * Runs Golden Case verification against production implementation or an optional custom runner.
 * Used both for operational verification and for proving fault detection (Test F).
 */
export function evaluateGoldenCases(runnerOverride = null) {
  const results = [];

  GOLDEN_CASES.forEach(gc => {
    let actualOutput = null;
    let passed = false;
    let failureReason = null;

    try {
      if (runnerOverride && typeof runnerOverride === 'function') {
        actualOutput = runnerOverride(gc);
      } else {
        // Run against actual production logic
        if (gc.category === "DIMENSIONS") {
          const res = parseProductSpecs(gc.input);
          actualOutput = {
            diameter: res.diameter,
            thickness: res.thickness
          };
        } else if (gc.category === "WEIGHT") {
          const testData = [{
            "Date": "2026-09-07",
            "Item Code": "TEST",
            "Product Description & Specs": "TEST PIPE 110x5.3",
            "Machine": "KTS-350",
            "Production Qty (FG)": gc.input.qty,
            "Unit Weight (kg)": gc.input.unitWeight,
            "Total Weight (kg)": 0, // missing, to test auto-calc
            "Operating Hours": 24
          }];
          const cleaned = cleanPipeProductionData(testData);
          actualOutput = {
            calculatedTotalWeight: cleaned.cleanedRows[0]?.totalWeight
          };
        } else if (gc.category === "SCRAP") {
          const testData = [{
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
          const cleaned = cleanPipeProductionData(testData);
          actualOutput = {
            scrapPercentage: cleaned.cleanedRows[0]?.scrapPercentage
          };
        } else if (gc.category === "HOURS") {
          const testData = [{
            "Date": "2026-09-07",
            "Item Code": "TEST",
            "Product Description & Specs": "TEST PIPE 110x5.3",
            "Machine": "KTS-350",
            "Operating Hours": gc.input.operatingHours
          }];
          const cleaned = cleanPipeProductionData(testData);
          actualOutput = {
            downtimeHours: cleaned.cleanedRows[0]?.downtimeHours
          };
        } else if (gc.category === "THROUGHPUT") {
          const testData = [{
            "Date": "2026-09-07",
            "Item Code": "TEST",
            "Product Description & Specs": "TEST PIPE 110x5.3",
            "Machine": "KTS-350",
            "Total Weight (kg)": gc.input.totalWeight,
            "Operating Hours": gc.input.operatingHours
          }];
          const cleaned = cleanPipeProductionData(testData);
          actualOutput = {
            lineRateKgPerHour: cleaned.cleanedRows[0]?.lineRateKgPerHour
          };
        }
      }

      // Independent comparison
      passed = true;
      const expectedKeys = Object.keys(gc.independentExpected);
      for (const k of expectedKeys) {
        const exp = gc.independentExpected[k];
        const act = actualOutput ? actualOutput[k] : undefined;

        if (typeof exp === 'number') {
          // Check numerical tolerance (up to 0.05 difference)
          if (Math.abs(exp - act) > 0.05) {
            passed = false;
            failureReason = `Numerical mismatch on ${k}: Expected ${exp}, but received ${act}`;
            break;
          }
        } else {
          // Exact string match
          if (String(exp).trim() !== String(act).trim()) {
            passed = false;
            failureReason = `String mismatch on ${k}: Expected "${exp}", but received "${act}"`;
            break;
          }
        }
      }
    } catch (err) {
      passed = false;
      failureReason = `Execution exception: ${err.message}`;
    }

    results.push({
      goldenCaseId: gc.id,
      name: gc.name,
      capabilityId: gc.capabilityId,
      input: gc.input,
      independentExpected: gc.independentExpected,
      actualOutput,
      passed,
      failureReason,
      referenceStandard: gc.referenceStandard
    });
  });

  const totalPassed = results.filter(r => r.passed).length;
  const totalFailed = results.length - totalPassed;

  return {
    totalGoldenCases: results.length,
    passedCount: totalPassed,
    failedCount: totalFailed,
    allPassed: totalFailed === 0,
    results
  };
}
