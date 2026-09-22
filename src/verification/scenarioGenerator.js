/**
 * Dynamic Scenario Generator
 * 
 * Dynamically reads the CURRENT Capability Registry and derives realistic operational
 * verification scenarios with independent expected results, explicit test data,
 * and cross-system consistency checks.
 * 
 * Avoids meaningless combinatorial explosion by generating combinations ONLY
 * when capabilities share dependencies or common affected state/modules.
 */

import { registry as defaultRegistry } from './capabilityRegistry.js';
import { GOLDEN_CASES } from './goldenCaseEngine.js';

export class ScenarioGenerator {
  constructor(registry = defaultRegistry) {
    this.registry = registry;
  }

  /**
   * Generates the comprehensive operational verification plan from current capabilities.
   */
  generatePlan() {
    const capabilities = this.registry.getAll();
    const coverageReport = this.registry.getCoverageReport();

    const scenarios = [];

    // 1. Generate Core Scenarios for each covered capability
    capabilities.forEach(cap => {
      // Only generate scenarios if capability has basic verification metadata
      if (!cap.possibleStates || cap.possibleStates.length === 0) return;

      cap.possibleStates.forEach((state, stateIdx) => {
        const scenario = this.buildCoreScenario(cap, state, stateIdx);
        if (scenario) scenarios.push(scenario);
      });
    });

    // 2. Generate Meaningful Interaction Scenarios between related capabilities
    const interactionScenarios = this.generateInteractionScenarios(capabilities);
    scenarios.push(...interactionScenarios);

    // 3. Generate Critical Edge Case Scenarios
    capabilities.forEach(cap => {
      if (cap.edgeCases && Array.isArray(cap.edgeCases)) {
        cap.edgeCases.forEach((edgeCase, edgeIdx) => {
          const scenario = this.buildEdgeCaseScenario(cap, edgeCase, edgeIdx);
          if (scenario) scenarios.push(scenario);
        });
      }
    });

    // 4. Attach Deterministic Golden Case Verification Scenarios
    GOLDEN_CASES.forEach((gc, gcIdx) => {
      const scenario = this.buildGoldenCaseScenario(gc, gcIdx);
      if (scenario) scenarios.push(scenario);
    });

    return {
      generatedAt: new Date().toISOString(),
      capabilitiesCount: capabilities.length,
      coveredCapabilitiesCount: coverageReport.coveredCount,
      uncoveredCapabilitiesCount: coverageReport.uncoveredCount,
      partiallyCoveredCount: coverageReport.partiallyCoveredCount,
      totalScenarios: scenarios.length,
      autoCount: scenarios.filter(s => s.verificationType === "AUTO VERIFY").length,
      manualCount: scenarios.filter(s => s.verificationType === "MANUAL VERIFY").length,
      hybridCount: scenarios.filter(s => s.verificationType === "HYBRID VERIFY").length,
      coverageReport,
      scenarios
    };
  }

  /**
   * Builds a primary operational scenario for a single capability state.
   */
  buildCoreScenario(cap, state, stateIdx) {
    const id = `SCENARIO-${cap.capabilityId}-${state.stateId}`;

    let businessContext = "";
    let testData = null;
    let executionSteps = [];
    let expectedResults = {};
    let crossSystemChecks = [];
    let verificationType = "AUTO VERIFY";

    if (cap.capabilityId === "CAP-DIM-EXTRACT") {
      if (state.stateId === "METRIC_CROSS") {
        businessContext = "Standard extrusion run of uPVC main distribution pipes specified with diameter and wall thickness cross-notation.";
        testData = {
          rawRow: {
            "Date": "2026-09-07",
            "Item Code": 249,
            "Product Description & Specs": "uPVC PIPE 110x5.3 PN-12.5 SASO-ISO",
            "Machine": "KTS-350",
            "Production Qty (FG)": 392,
            "Unit Weight (kg)": 17.30,
            "Total Weight (kg)": 6782.00,
            "Scrap / Rejection (kg)": 0,
            "Operating Hours": 24
          }
        };
        executionSteps = [
          "Ingest row with description 'uPVC PIPE 110x5.3 PN-12.5 SASO-ISO'",
          "Execute dimension regex parser",
          "Verify Diameter and Thickness columns inserted into table record"
        ];
        // INDEPENDENT EXPECTED RESULT
        expectedResults = {
          diameter: "110 mm",
          thickness: "5.3 mm",
          material: "uPVC"
        };
        crossSystemChecks = [
          "Diameter column in data table displays '110 mm'",
          "Thickness column in data table displays '5.3 mm'",
          "Export payload contains 'Diameter' and 'Thickness' headers"
        ];
      } else if (state.stateId === "IMPERIAL_SDR") {
        businessContext = "Production of municipal 4-inch sewer pipes ordered by SDR (Standard Dimension Ratio) rating.";
        testData = {
          rawRow: {
            "Date": "2026-09-07",
            "Item Code": 991,
            "Product Description & Specs": "PVC 4\" PIPE SDR 26 ASTMD 2241",
            "Machine": "KABRA-90",
            "Production Qty (FG)": 140,
            "Unit Weight (kg)": 16.00,
            "Total Weight (kg)": 2240.00,
            "Scrap / Rejection (kg)": 40,
            "Operating Hours": 12
          }
        };
        executionSteps = [
          "Ingest row with description 'PVC 4\" PIPE SDR 26 ASTMD 2241'",
          "Parse imperial inch symbol and SDR wall spec",
          "Inspect table and summary outputs"
        ];
        expectedResults = {
          diameter: '4"',
          thickness: "SDR 26",
          material: "PVC"
        };
        crossSystemChecks = [
          "Table cell displays 4\" with cyan badge",
          "Table cell displays SDR 26 with blue badge",
          "Total weight 2240 kg reflects on KABRA-90 machine chart"
        ];
      } else if (state.stateId === "METRIC_SEPARATE_MM") {
        businessContext = "Extrusion of 75mm conduit pipes with explicit separate MM designation for wall thickness.";
        testData = {
          rawRow: {
            "Date": "2026-09-07",
            "Item Code": 253,
            "Product Description & Specs": "uPVC PIPE 75MM PN10X3.6MM SASO-ISO",
            "Machine": "KTS-350 TDH",
            "Production Qty (FG)": 700,
            "Unit Weight (kg)": 8.20,
            "Total Weight (kg)": 5740.00,
            "Scrap / Rejection (kg)": 0,
            "Operating Hours": 24
          }
        };
        executionSteps = [
          "Ingest 'uPVC PIPE 75MM PN10X3.6MM SASO-ISO'",
          "Extract diameter '75 mm' and thickness '3.6 mm'",
          "Confirm no unit collision between PN rating and wall mm"
        ];
        expectedResults = {
          diameter: "75 mm",
          thickness: "3.6 mm",
          material: "uPVC"
        };
        crossSystemChecks = [
          "Diameter extracted as 75 mm",
          "Thickness extracted as 3.6 mm"
        ];
      } else if (state.stateId === "IMPERIAL_SCHEDULE") {
        businessContext = "Extrusion of 3/4-inch electrical conduit conforming to Schedule 40.";
        testData = {
          rawRow: {
            "Date": "2026-09-07",
            "Item Code": 198,
            "Product Description & Specs": "PVC PIPE 3/4\"SCH40",
            "Machine": "KTS-200",
            "Production Qty (FG)": 600,
            "Unit Weight (kg)": 1.60,
            "Total Weight (kg)": 960.00,
            "Scrap / Rejection (kg)": 0,
            "Operating Hours": 12
          }
        };
        executionSteps = [
          "Ingest 'PVC PIPE 3/4\"SCH40'",
          "Parse fractional inch diameter and compact schedule string",
          "Normalize schedule with space as 'SCH 40'"
        ];
        expectedResults = {
          diameter: '3/4"',
          thickness: "SCH 40",
          material: "PVC"
        };
        crossSystemChecks = [
          "Diameter is 3/4\"",
          "Thickness is SCH 40"
        ];
      }
    } else if (cap.capabilityId === "CAP-MATH-AUDIT") {
      if (state.stateId === "MISSING_WEIGHT") {
        businessContext = "Operator entered Qty and Unit Weight but omitted Total Weight column in daily spreadsheet.";
        testData = {
          rawRow: {
            "Date": "2026-09-08",
            "Item Code": 255,
            "Product Description & Specs": "uPVC PIPE 50x2.4 PN-10 SASO-ISO",
            "Machine": "KTS-170",
            "Production Qty (FG)": 900,
            "Unit Weight (kg)": 3.80,
            "Total Weight (kg)": 0, // Omitted
            "Operating Hours": 24
          }
        };
        executionSteps = [
          "Ingest row with Qty=900, Unit Weight=3.80, Total Weight=0",
          "Trigger formula audit and auto-fill",
          "Check auto-computed total weight and logged audit correction"
        ];
        // Independent calculation: 900 * 3.80 = 3420.00
        expectedResults = {
          totalWeight: 3420.00,
          adjustmentCountIncrement: 1
        };
        crossSystemChecks = [
          "Table cell displays 3,420.00 kg",
          "Audit summary increments 'Auto-Calculations' badge",
          "KPI Total Weight includes 3,420.00 kg"
        ];
      } else if (state.stateId === "DISCREPANCY") {
        businessContext = "Typo in manual Excel formula causing 500 kg difference between Qty * Unit Wt and entered Total Weight.";
        testData = {
          rawRow: {
            "Date": "2026-09-08",
            "Item Code": 249,
            "Product Description & Specs": "uPVC PIPE 110x5.3 PN-12.5 SASO-ISO",
            "Machine": "KTS-350",
            "Production Qty (FG)": 420,
            "Unit Weight (kg)": 17.30,
            "Total Weight (kg)": 6700.00, // True calculation is 420 * 17.30 = 7266.00 (diff: 566 kg)
            "Operating Hours": 24
          }
        };
        executionSteps = [
          "Ingest row with discordant Total Weight",
          "Run mathematical verification against Qty * Unit Wt",
          "Detect difference > 5 kg and flag audit warning"
        ];
        expectedResults = {
          hasIssues: true,
          expectedWeight: 7266.00,
          discrepancyDiff: 566.00
        };
        crossSystemChecks = [
          "Row highlighted in amber in CleaningAuditTable",
          "Audit Report increments warnings count",
          "Row issues list explains difference"
        ];
      }
    } else if (cap.capabilityId === "CAP-HRS-DOWNTIME") {
      if (state.stateId === "PARTIAL_SHIFT_LOGGED") {
        businessContext = "Line KTS-350 halted for 12 hours due to mold setup for Manarco 3-inch pipes.";
        testData = {
          rawRow: {
            "Date": "2026-09-09",
            "Item Code": 1291,
            "Product Description & Specs": "MANARCO PVC PIPE 3\" SCH 40 ASTM",
            "Machine": "KTS-350",
            "Production Qty (FG)": 175,
            "Unit Weight (kg)": 15.00,
            "Total Weight (kg)": 2625.00,
            "Operating Hours": 12,
            "Reason of Stop": "Mold Setup"
          }
        };
        executionSteps = [
          "Ingest row with Operating Hours=12 and Reason='Mold Setup'",
          "Calculate Downtime Hours = 24 - 12 = 12",
          "Aggregate downtime under 'Mold Setup' in Pareto analytics"
        ];
        expectedResults = {
          operatingHours: 12,
          downtimeHours: 12,
          reasonOfStop: "Mold Setup"
        };
        crossSystemChecks = [
          "Table cell displays 12h run / 12h downtime",
          "KPI Total Downtime increases by 12 hrs",
          "Downtime Pareto chart displays 'Mold Setup' with 12 hrs"
        ];
      } else if (state.stateId === "PARTIAL_SHIFT_UNLOGGED") {
        businessContext = "Machine halted for 13 hours but operator forgot to write reason of stop in shift log.";
        testData = {
          rawRow: {
            "Date": "2026-09-08",
            "Item Code": 253,
            "Product Description & Specs": "uPVC PIPE 75MM PN10X3.6MM SASO-ISO",
            "Machine": "KTS-350 TDH",
            "Operating Hours": 11,
            "Reason of Stop": "" // Empty
          }
        };
        executionSteps = [
          "Ingest row with Operating Hours=11 and empty reason",
          "Derive Downtime = 13 hrs",
          "Apply business rule RULE-HRS-003: assign 'Unspecified' and flag adjustment"
        ];
        expectedResults = {
          operatingHours: 11,
          downtimeHours: 13,
          reasonOfStop: "غير محدد (Unspecified)"
        };
        crossSystemChecks = [
          "Reason cell displays Unspecified flag",
          "Adjustment noted in table audit badges"
        ];
      }
    } else if (cap.capabilityId === "CAP-SCRAP-AUDIT") {
      if (state.stateId === "NORMAL_SCRAP") {
        businessContext = "Start-up of 4-inch pipe extrusion resulting in 40 kg purge scrap (1.75% of compound).";
        testData = {
          rawRow: {
            "Date": "2026-09-07",
            "Item Code": 991,
            "Product Description & Specs": "PVC 4\" PIPE SDR 26 ASTMD 2241",
            "Machine": "KABRA-90",
            "Total Weight (kg)": 2240.00,
            "Scrap / Rejection (kg)": 40.00,
            "Operating Hours": 12
          }
        };
        executionSteps = [
          "Ingest 2240 kg FG and 40 kg scrap",
          "Calculate total raw material: 2240 + 40 = 2280 kg",
          "Calculate scrap % = (40 / 2280) * 100 = 1.75%"
        ];
        expectedResults = {
          scrapKg: 40.00,
          scrapPercentage: 1.75,
          hasHighScrapWarning: false
        };
        crossSystemChecks = [
          "Table cell displays 40 kg / 1.75%",
          "KPI Total Scrap includes 40 kg",
          "Machine Scrap bar in chart shows 40 kg"
        ];
      } else if (state.stateId === "HIGH_SCRAP") {
        businessContext = "Severe temperature fluctuation during heater band malfunction causing 150 kg scrap on 500 kg production (23% scrap).";
        testData = {
          rawRow: {
            "Date": "2026-09-09",
            "Item Code": 249,
            "Product Description & Specs": "uPVC PIPE 110x5.3 PN-12.5 SASO-ISO",
            "Machine": "KTS-350",
            "Total Weight (kg)": 500.00,
            "Scrap / Rejection (kg)": 150.00,
            "Operating Hours": 12,
            "Reason of Stop": "Heater Band Malfunction"
          }
        };
        executionSteps = [
          "Ingest 500 kg FG and 150 kg scrap",
          "Calculate scrap % = (150 / 650) * 100 = 23.08%",
          "Trigger RULE-SCRAP-003: flag high scrap warning (> 5%)"
        ];
        expectedResults = {
          scrapKg: 150.00,
          scrapPercentage: 23.08,
          hasHighScrapWarning: true
        };
        crossSystemChecks = [
          "Table row highlights red badge for scrap > 5%",
          "Warning added to audit issue counters"
        ];
      }
    } else if (cap.capabilityId === "CAP-CLEAN-EXPORT") {
      businessContext = "Plant manager generates clean, certified monthly production file for ERP import.";
      testData = {
        rowCount: 19,
        sampleDesc: "uPVC PIPE 110x5.3 PN-12.5 SASO-ISO"
      };
      executionSteps = [
        "User clicks 'Export Clean Excel'",
        "Verify workbook contains sheets: 'Daily Production Log' and 'Machine Performance'",
        "Verify new columns 'Diameter' and 'Thickness' exist without altering original headers"
      ];
      expectedResults = {
        primarySheetName: "Daily Production Log",
        hasDiameterColumn: true,
        hasThicknessColumn: true,
        originalColumnsPreserved: true
      };
      crossSystemChecks = [
        "Exported Excel contains exact row count of cleaned dataset",
        "Sheet names match factory reporting standards"
      ];
      verificationType = "HYBRID VERIFY";
    }

    if (!businessContext) {
      // Default fallback for any generic state
      businessContext = `Operational verification of ${cap.name} under state: ${state.label}.`;
      testData = { input: cap.inputs[0]?.example || "sample" };
      executionSteps = [
        `Initialize ${cap.name}`,
        `Apply state conditions for ${state.stateId}`,
        `Verify expected downstream effects`
      ];
      expectedResults = { stateValidated: true };
      crossSystemChecks = [`Module ${cap.affectedModules[0] || 'UI'} reflects state changes`];
    }

    return {
      id,
      name: `${cap.name} [${state.label || state.stateId}]`,
      capabilityId: cap.capabilityId,
      stateId: state.stateId,
      scenarioCategory: "CORE_CAPABILITY",
      businessContext,
      capabilitiesCovered: [cap.capabilityId],
      relatedRules: cap.businessRules.map(r => r.ruleId),
      testData,
      executionSteps,
      expectedResults,
      crossSystemChecks,
      successCriteria: {
        passed: "All independent calculations match within tolerance and cross-view states remain consistent.",
        needsFix: "Calculation deviates from independent formula or cross-system inconsistency detected.",
        notTested: "Scenario generated but automated or manual evaluation has not yet executed."
      },
      verificationType,
      status: "NOT_TESTED"
    };
  }

  /**
   * Generates meaningful interaction scenarios ONLY for capabilities that share
   * dependencies or common affected state/modules.
   */
  generateInteractionScenarios(capabilities) {
    const interactions = [];

    // Interaction 1: Weight Formula Audit + Scrap Audit (both dictate total raw compound weight)
    const capMath = capabilities.find(c => c.capabilityId === "CAP-MATH-AUDIT");
    const capScrap = capabilities.find(c => c.capabilityId === "CAP-SCRAP-AUDIT");

    if (capMath && capScrap) {
      interactions.push({
        id: "SCENARIO-INT-MATH-SCRAP",
        name: "Cross-Audit: Auto-Weight Calculation & Compounding Scrap Rate",
        scenarioCategory: "INTERACTION",
        businessContext: "Operator submitted shift with omitted Total Weight AND recorded scrap. System must auto-calculate Total Weight first, then correctly derive total compounding material and scrap percentage.",
        capabilitiesCovered: ["CAP-MATH-AUDIT", "CAP-SCRAP-AUDIT"],
        relatedRules: ["RULE-WT-002", "RULE-SCRAP-001", "RULE-SCRAP-002"],
        testData: {
          rawRow: {
            "Date": "2026-09-07",
            "Item Code": 991,
            "Product Description & Specs": "PVC 4\" PIPE SDR 26 ASTMD 2241",
            "Machine": "KABRA-90",
            "Production Qty (FG)": 140,
            "Unit Weight (kg)": 16.00,
            "Total Weight (kg)": 0, // Missing! Needs auto-calc: 140 * 16 = 2240 kg
            "Scrap / Rejection (kg)": 40.00,
            "Operating Hours": 12
          }
        },
        executionSteps: [
          "Ingest record with Total Weight = 0 and Scrap = 40 kg",
          "CAP-MATH-AUDIT calculates Total Weight: 140 * 16.00 = 2240.00 kg",
          "CAP-SCRAP-AUDIT computes Total Raw Compound: 2240 + 40 = 2280.00 kg",
          "CAP-SCRAP-AUDIT derives Scrap % = (40 / 2280) * 100 = 1.75%"
        ],
        // Independent Expected Calculations
        expectedResults: {
          autoComputedTotalWeight: 2240.00,
          totalRawMaterial: 2280.00,
          scrapPercentage: 1.75
        },
        crossSystemChecks: [
          "Table cell displays auto-filled 2,240.00 kg",
          "Table cell displays 1.75% scrap rate",
          "Total Tonnage KPI reflects the 2.24 Tons"
        ],
        successCriteria: {
          passed: "Auto-computed weight accurately feeds into scrap percentage formula with zero cascading distortion.",
          needsFix: "Scrap percentage calculated against zero weight or wrong compound sum.",
          notTested: "Not yet evaluated."
        },
        verificationType: "AUTO VERIFY",
        status: "NOT_TESTED"
      });
    }

    // Interaction 2: Operating Hours Downtime + KPI Extruder Throughput Speed (kg/hr)
    const capHours = capabilities.find(c => c.capabilityId === "CAP-HRS-DOWNTIME");
    const capKpi = capabilities.find(c => c.capabilityId === "CAP-KPI-AGGREGATION");

    if (capHours && capKpi) {
      interactions.push({
        id: "SCENARIO-INT-HOURS-THROUGHPUT",
        name: "Cross-System: Partial Shift Downtime & Line Extrusion Speed (kg/hr)",
        scenarioCategory: "INTERACTION",
        businessContext: "Line KTS-350 operated 12 hours producing 2664 kg, with 12 hours downtime for heater band maintenance. System must calculate exact extrusion rate based strictly on active run hours, not calendar 24h.",
        capabilitiesCovered: ["CAP-HRS-DOWNTIME", "CAP-KPI-AGGREGATION"],
        relatedRules: ["RULE-HRS-002", "RULE-KPI-002"],
        testData: {
          rawRow: {
            "Date": "2026-09-09",
            "Item Code": 249,
            "Product Description & Specs": "uPVC PIPE 110x5.3 PN-12.5 SASO-ISO",
            "Machine": "KTS-350",
            "Total Weight (kg)": 2664.00,
            "Operating Hours": 12.00,
            "Reason of Stop": "Heater Band Issue"
          }
        },
        executionSteps: [
          "Ingest 2664 kg on 12 hours operating time",
          "Verify Downtime Hours = 12",
          "Compute Extrusion Throughput: 2664 kg / 12 hrs = 222.0 kg/hr",
          "Confirm throughput is NOT calculated against 24 hours (which would falsely report 111.0 kg/hr)"
        ],
        expectedResults: {
          downtimeHours: 12.00,
          throughputKgPerHour: 222.0
        },
        crossSystemChecks: [
          "Table cell displays 222.0 kg/hr",
          "Machine Speed horizontal bar chart reflects 222.0 kg/hr",
          "Downtime Pareto chart displays 12h under 'Heater Band Issue'"
        ],
        successCriteria: {
          passed: "Throughput divides strictly by actual operating hours, and downtime correctly logs.",
          needsFix: "Throughput incorrectly divided by 24 or zero division occurs.",
          notTested: "Not yet evaluated."
        },
        verificationType: "AUTO VERIFY",
        status: "NOT_TESTED"
      });
    }

    // Interaction 3: Dimension Extraction + Clean Multi-Sheet Export
    const capDim = capabilities.find(c => c.capabilityId === "CAP-DIM-EXTRACT");
    const capExp = capabilities.find(c => c.capabilityId === "CAP-CLEAN-EXPORT");

    if (capDim && capExp) {
      interactions.push({
        id: "SCENARIO-INT-DIM-EXPORT",
        name: "End-to-End: Dimension Extraction to Cleaned Multi-Sheet Excel",
        scenarioCategory: "INTERACTION",
        businessContext: "Ensures newly parsed Diameter and Thickness columns flow cleanly into the SheetJS workbook payload without shifting column alignments or corrupting original fields.",
        capabilitiesCovered: ["CAP-DIM-EXTRACT", "CAP-CLEAN-EXPORT"],
        relatedRules: ["RULE-DIM-001", "RULE-EXP-001", "RULE-EXP-002"],
        testData: {
          description: "uPVC PIPE 110x5.3 PN-12.5 SASO-ISO"
        },
        executionSteps: [
          "Parse description into Diameter '110 mm' and Thickness '5.3 mm'",
          "Construct exported workbook row object",
          "Verify Diameter and Thickness precede or neatly align with specs",
          "Verify cell data types in generated worksheet"
        ],
        expectedResults: {
          hasDiameterInExport: true,
          hasThicknessInExport: true,
          originalDescriptionIntact: true
        },
        crossSystemChecks: [
          "Exported worksheet column headers match expected schema",
          "No column index misalignment in generated binary Excel"
        ],
        successCriteria: {
          passed: "Exported worksheet contains intact Diameter and Thickness columns.",
          needsFix: "Missing columns or misplaced cell values in export.",
          notTested: "Not yet evaluated."
        },
        verificationType: "AUTO VERIFY",
        status: "NOT_TESTED"
      });
    }

    return interactions;
  }

  /**
   * Builds an edge-case verification scenario.
   */
  buildEdgeCaseScenario(cap, edgeCase, edgeIdx) {
    return {
      id: `SCENARIO-EDGE-${cap.capabilityId}-${edgeCase.caseId}`,
      name: `Edge Case: ${edgeCase.description}`,
      capabilityId: cap.capabilityId,
      scenarioCategory: "EDGE_CASE",
      businessContext: `Boundary and anomaly handling for ${cap.name}: ${edgeCase.description}.`,
      capabilitiesCovered: [cap.capabilityId],
      relatedRules: cap.businessRules.map(r => r.ruleId),
      testData: { edgeCaseInput: edgeCase.input },
      executionSteps: [
        `Feed boundary test data: ${JSON.stringify(edgeCase.input)}`,
        `Execute ${cap.name} processing pipeline`,
        `Assert that the system does not crash or produce invalid numeric state (NaN/Infinity)`
      ],
      expectedResults: {
        gracefulDegradation: true,
        noRuntimeCrash: true
      },
      crossSystemChecks: [
        "System remains stable with clear user-facing warning or clean fallback value"
      ],
      successCriteria: {
        passed: "Boundary input handled gracefully without unhandled exceptions or data corruption.",
        needsFix: "System threw uncaught error, rendered NaN, or distorted other records.",
        notTested: "Not yet evaluated."
      },
      verificationType: "AUTO VERIFY",
      status: "NOT_TESTED"
    };
  }

  /**
   * Builds a deterministic Golden Case verification scenario.
   */
  buildGoldenCaseScenario(gc, gcIdx) {
    return {
      id: `SCENARIO-GOLDEN-${gc.id}`,
      name: `Golden Truth: ${gc.name}`,
      capabilityId: gc.capabilityId,
      goldenCaseId: gc.id,
      scenarioCategory: "GOLDEN_CASE",
      businessContext: `Strict deterministic benchmark: compares production output against an independently verified ground truth (${gc.referenceStandard}).`,
      capabilitiesCovered: [gc.capabilityId],
      relatedRules: [],
      testData: { goldenInput: gc.input },
      executionSteps: [
        `Load known standard input: ${typeof gc.input === 'object' ? JSON.stringify(gc.input) : gc.input}`,
        `Execute production calculation logic`,
        `Compare production result against independent golden ground truth: ${JSON.stringify(gc.independentExpected)}`
      ],
      expectedResults: gc.independentExpected,
      crossSystemChecks: [
        `Output must match ground truth reference from standard: ${gc.referenceStandard}`
      ],
      successCriteria: {
        passed: "Exact match or within acceptable numerical tolerance (0.05).",
        needsFix: "Production calculation deviates from verified ground truth.",
        notTested: "Not yet evaluated."
      },
      verificationType: "AUTO VERIFY",
      status: "NOT_TESTED"
    };
  }
}
