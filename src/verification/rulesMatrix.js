/**
 * Operational Rules & Traceability Matrix
 * 
 * Defines standard operational business rules and provides complete traceability:
 * Operational Rule ➔ Capability ➔ Scenario ➔ Expected Result ➔ Verification Result.
 */

export const OPERATIONAL_RULES = [
  {
    ruleId: "RULE-DIM-001",
    title: "Metric Cross Notation Specification",
    category: "DIMENSIONS",
    standard: "ISO 1452 / SASO 14-15",
    statement: "Extrusion logs specifying pipe geometry via metric cross notation (e.g. 110x5.3) must map the first numerical value to Outside Diameter (mm) and the second value to Nominal Wall Thickness (mm)."
  },
  {
    ruleId: "RULE-DIM-002",
    title: "Imperial Diameter & Schedule / SDR Rating",
    category: "DIMENSIONS",
    standard: "ASTM D1785 / ASTM D2241",
    statement: "Extrusion logs specifying imperial pipes with inch marks (e.g. 4\" or 3/4\") must retain the inch notation in Diameter and categorize thickness by Schedule (e.g. SCH 40) or SDR (e.g. SDR 26)."
  },
  {
    ruleId: "RULE-DIM-003",
    title: "Separate Millimeter Wall Rating",
    category: "DIMENSIONS",
    standard: "DIN 8062",
    statement: "Specs specifying diameter and wall thickness with separate MM designations (e.g. 75MM 2.2MM) must extract both without collision with pressure class ratings (e.g. PN-10)."
  },
  {
    ruleId: "RULE-WT-001",
    title: "Total Finished Weight Fundamental Law",
    category: "WEIGHT",
    standard: "Standard Physical Mass Conservation",
    statement: "Total Weight (kg) of finished pipe extrusion must equal finished pieces (Production Qty FG) multiplied by the unit weight (kg/piece)."
  },
  {
    ruleId: "RULE-WT-002",
    title: "Missing Weight Automatic Interpolation",
    category: "WEIGHT",
    standard: "Plant Operational Standard Protocol",
    statement: "If an operator logs quantity and unit weight but leaves total weight blank or zero, the system must auto-calculate Total Weight and record an audit adjustment."
  },
  {
    ruleId: "RULE-WT-003",
    title: "Weight Discrepancy Tolerance Threshold",
    category: "WEIGHT",
    standard: "Inventory Audit Protocol",
    statement: "Deviations between recorded total weight and mathematically calculated weight exceeding 5.0 kg must trigger an audit discrepancy warning."
  },
  {
    ruleId: "RULE-HRS-001",
    title: "24-Hour Calendar Shift Constraint",
    category: "HOURS",
    standard: "Plant Shift Protocol",
    statement: "Operating hours for any single extrusion line on a given calendar day must not exceed 24.0 hours."
  },
  {
    ruleId: "RULE-HRS-002",
    title: "Derived Line Downtime Formula",
    category: "HOURS",
    standard: "OEE Continuous Extrusion Availability",
    statement: "Downtime Hours must equal 24.0 minus actual operating hours for lines operating on a continuous 24/7 calendar schedule."
  },
  {
    ruleId: "RULE-HRS-003",
    title: "Mandatory Stoppage Reason Traceability",
    category: "HOURS",
    standard: "Plant Quality SOP",
    statement: "Any machine with downtime greater than 0 hours must document the reason of stop (e.g. Mold Changeover, Maintenance, Electrical); if omitted, it must be flagged as 'Unspecified'."
  },
  {
    ruleId: "RULE-SCRAP-001",
    title: "Total Raw Compound Mass Balance",
    category: "SCRAP",
    standard: "Compounding Mass Balance",
    statement: "Total input raw material consumed equals finished pipe weight plus purge/rejection scrap weight."
  },
  {
    ruleId: "RULE-SCRAP-002",
    title: "True Scrap Percentage Calculation",
    category: "SCRAP",
    standard: "Manufacturing Waste Metric",
    statement: "Scrap % must be calculated as (Scrap Weight / (Total Finished Weight + Scrap Weight)) * 100."
  },
  {
    ruleId: "RULE-SCRAP-003",
    title: "Quality Waste Alarm Threshold",
    category: "SCRAP",
    standard: "Factory Quality Benchmark",
    statement: "Production runs exhibiting scrap percentage greater than 5.0% must be flagged with a high scrap warning."
  },
  {
    ruleId: "RULE-EXP-001",
    title: "Certified Spreadsheet Schema Preservation",
    category: "EXPORT",
    standard: "ERP Integration Standard",
    statement: "Cleaned Excel exports must preserve all original columns unaltered and cleanly append or insert extracted dimensions."
  }
];

/**
 * Builds the comprehensive Traceability Matrix linking:
 * Rule ➔ Capability ➔ Scenario ➔ Verification Status
 */
export function buildTraceabilityMatrix(plan, verificationResults = new Map()) {
  const matrix = OPERATIONAL_RULES.map(rule => {
    // Find all capabilities that mention this rule
    const matchingCapabilities = (plan.coverageReport?.covered || []).filter(cap => 
      (cap.businessRules || []).some(r => r.ruleId === rule.ruleId)
    );

    // Find all scenarios referencing this rule
    const matchingScenarios = (plan.scenarios || []).filter(sc => 
      (sc.relatedRules || []).includes(rule.ruleId)
    );

    const scenarioStatuses = matchingScenarios.map(sc => {
      const execResult = verificationResults.get(sc.id);
      return {
        scenarioId: sc.id,
        scenarioName: sc.name,
        verificationType: sc.verificationType,
        status: execResult ? execResult.status : sc.status
      };
    });

    const isCovered = matchingScenarios.length > 0;
    const allPassed = isCovered && scenarioStatuses.every(s => s.status === "PASSED");
    const hasFailure = scenarioStatuses.some(s => s.status === "NEEDS_FIX");

    return {
      ruleId: rule.ruleId,
      title: rule.title,
      category: rule.category,
      standard: rule.standard,
      statement: rule.statement,
      capabilities: matchingCapabilities.map(c => ({ id: c.capabilityId, name: c.name })),
      scenarios: scenarioStatuses,
      coverageStatus: !isCovered ? "UNCOVERED" : hasFailure ? "FAILING" : allPassed ? "VERIFIED" : "PENDING_VERIFICATION"
    };
  });

  return matrix;
}
