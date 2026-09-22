/**
 * Self-Aware Capability Registry
 * The authoritative Source of Truth for testable application capabilities.
 * 
 * Future capabilities can register themselves dynamically via registerCapability().
 */

export class CapabilityRegistry {
  constructor() {
    this.capabilities = new Map();
    this.exemptions = new Map();
  }

  /**
   * Register a capability with structured verification metadata.
   */
  register(cap) {
    if (!cap || !cap.capabilityId) {
      throw new Error("Capability registration requires a valid capabilityId.");
    }
    this.capabilities.set(cap.capabilityId, {
      ...cap,
      registeredAt: cap.registeredAt || new Date().toISOString(),
      version: cap.version || "1.0.0"
    });
    return this;
  }

  /**
   * Declare a capability as explicitly verification-exempt with a declared business reason.
   */
  declareExempt(capabilityId, reason, declaredBy = "Developer") {
    this.exemptions.set(capabilityId, {
      capabilityId,
      reason,
      declaredBy,
      declaredAt: new Date().toISOString()
    });
    return this;
  }

  get(capabilityId) {
    return this.capabilities.get(capabilityId);
  }

  getAll() {
    return Array.from(this.capabilities.values());
  }

  getExemptions() {
    return Array.from(this.exemptions.values());
  }

  /**
   * Evaluates verification coverage of every registered capability.
   * Detects missing or incomplete verification metadata.
   */
  getCoverageReport() {
    const all = this.getAll();
    const covered = [];
    const partiallyCovered = [];
    const uncovered = [];

    all.forEach(cap => {
      const missingFields = [];

      if (!cap.businessPurpose) missingFields.push("businessPurpose");
      if (!cap.userActions || cap.userActions.length === 0) missingFields.push("userActions");
      if (!cap.inputs || cap.inputs.length === 0) missingFields.push("inputs");
      if (!cap.possibleStates || cap.possibleStates.length === 0) missingFields.push("possibleStates");
      if (!cap.businessRules || cap.businessRules.length === 0) missingFields.push("businessRules");
      if (!cap.invariants || cap.invariants.length === 0) missingFields.push("invariants");
      if (!cap.expectedEffects || cap.expectedEffects.length === 0) missingFields.push("expectedEffects");
      if (!cap.edgeCases || cap.edgeCases.length === 0) missingFields.push("edgeCases");

      let coverageStatus = "COVERED";
      let statusMessage = "Full verification metadata registered";

      if (missingFields.length >= 4) {
        coverageStatus = "UNCOVERED";
        statusMessage = "⚠️ Verification Coverage Missing";
        uncovered.push({ ...cap, missingFields, coverageStatus, statusMessage });
      } else if (missingFields.length > 0) {
        coverageStatus = "PARTIALLY_COVERED";
        statusMessage = "⚠️ Scenario Definition Incomplete";
        partiallyCovered.push({ ...cap, missingFields, coverageStatus, statusMessage });
      } else {
        covered.push({ ...cap, missingFields: [], coverageStatus, statusMessage });
      }
    });

    return {
      totalCapabilities: all.length,
      coveredCount: covered.length,
      partiallyCoveredCount: partiallyCovered.length,
      uncoveredCount: uncovered.length,
      covered,
      partiallyCovered,
      uncovered,
      exemptions: this.getExemptions()
    };
  }
}

// Global Singleton Registry
export const registry = new CapabilityRegistry();

// ---------------------------------------------------------------------------
// INITIAL REGISTRATION OF CURRENT TESTABLE CAPABILITIES
// ---------------------------------------------------------------------------

// 1. Pipe Dimension & Spec Extraction
registry.register({
  capabilityId: "CAP-DIM-EXTRACT",
  name: "Pipe Dimension & Spec Extraction",
  description: "Extracts pipe Diameter and Thickness from Product Description & Specs across metric and imperial standards.",
  businessPurpose: "Enable production engineers to categorize extrusion orders by pipe diameter and wall schedule/SDR automatically.",
  userActions: [
    "Upload Excel workbook or enter product description manually",
    "View extracted Diameter and Thickness columns in the preview table",
    "Export cleaned spreadsheet with new columns intact"
  ],
  inputs: [
    { field: "productDescription", type: "string", example: "uPVC PIPE 110x5.3 PN-12.5 SASO-ISO" }
  ],
  possibleStates: [
    { stateId: "METRIC_CROSS", label: "Metric cross notation (e.g. 110x5.3, 50x2.4)", expectedFormat: "{dia} mm, {thick} mm" },
    { stateId: "METRIC_SEPARATE_MM", label: "Metric separate MM units (e.g. 75MM PN10X3.6MM, 75MM 2.2MM)", expectedFormat: "{dia} mm, {thick} mm" },
    { stateId: "IMPERIAL_SDR", label: "Imperial diameter with SDR (e.g. 4\" PIPE SDR 26)", expectedFormat: "{dia}\", SDR {num}" },
    { stateId: "IMPERIAL_SCHEDULE", label: "Imperial diameter with Schedule (e.g. 3/4\"SCH40, 3\" SCH 40)", expectedFormat: "{dia}\", SCH {num}" },
    { stateId: "UNSPECIFIED_SIZE", label: "Non-standard or missing description", expectedFormat: "-, -" }
  ],
  dependencies: [],
  affectedModules: ["dataCleaner", "analyticsEngine", "CleaningAuditTable", "ExcelExporter"],
  affectedViews: ["CleaningAuditTable", "AnalyticsCharts", "KpiCards"],
  businessRules: [
    { ruleId: "RULE-DIM-001", description: "Metric cross notation {A}x{B} maps A to Diameter (mm) and B to Thickness (mm)." },
    { ruleId: "RULE-DIM-002", description: "Imperial inch notation maps to Diameter with quotes and Schedule/SDR to Thickness." },
    { ruleId: "RULE-DIM-003", description: "Standalone millimeter specs must extract both nominal diameter and wall thickness." }
  ],
  invariants: [
    "Diameter must never be null (fallback to '-' if unresolvable).",
    "Thickness must never be null (fallback to '-' if unresolvable).",
    "Extracted diameter in mm must be strictly greater than extracted thickness in mm."
  ],
  expectedEffects: [
    "Inserts dedicated 'Diameter' and 'Thickness' columns into data records.",
    "Aggregates production tonnage by diameter in AnalyticsCharts.",
    "Preserves original Product Description column unaltered."
  ],
  edgeCases: [
    { caseId: "EDGE-DIM-FRACTION", description: "Fractional imperial sizes such as 3/4\" or 1 1/2\" without spaces before SCH", input: "PVC PIPE 3/4\"SCH40" },
    { caseId: "EDGE-DIM-MISSING", description: "Empty or non-pipe description", input: "" },
    { caseId: "EDGE-DIM-EXTRA-TEXT", description: "Manufacturer prefixes and ASTM suffixes", input: "MANARCO PVC PIPE 3\" SCH 40 ASTM" }
  ],
  persistenceBehavior: "Transient in table state, written as persistent columns upon Excel export.",
  calculationReferences: "Standard ISO 1452 / ASTM D1785 / SASO pipe dimensioning standards.",
  verificationPriority: "CRITICAL"
});

// 2. Production Weight Formula Audit
registry.register({
  capabilityId: "CAP-MATH-AUDIT",
  name: "Production Weight Formula Audit",
  description: "Audits mathematical consistency of Total Weight vs (Production Qty * Unit Weight) and auto-fills missing weights.",
  businessPurpose: "Prevent material discrepancy errors and billing/inventory mismatches caused by Excel formula omissions.",
  userActions: [
    "Upload production records with or without pre-calculated Total Weight",
    "Review detected mathematical discrepancies and auto-corrections in the Audit view"
  ],
  inputs: [
    { field: "qty", type: "number", example: 392 },
    { field: "unitWeight", type: "number", example: 17.30 },
    { field: "totalWeight", type: "number", example: 6782.00 }
  ],
  possibleStates: [
    { stateId: "EXACT_MATCH", label: "Recorded weight matches Qty * Unit Weight within rounding tolerance" },
    { stateId: "MISSING_WEIGHT", label: "Recorded weight is zero or blank -> Auto-computed" },
    { stateId: "DISCREPANCY", label: "Recorded weight deviates from Qty * Unit Weight by > 5 kg -> Flagged" }
  ],
  dependencies: [],
  affectedModules: ["dataCleaner", "analyticsEngine", "CleaningAuditTable", "KpiCards"],
  affectedViews: ["CleaningAuditTable", "KpiCards", "AnalyticsCharts"],
  businessRules: [
    { ruleId: "RULE-WT-001", description: "Expected Total Weight equals Production Qty multiplied by Unit Weight." },
    { ruleId: "RULE-WT-002", description: "If Total Weight is missing (0 or null), it must be auto-computed from Qty * Unit Weight." },
    { ruleId: "RULE-WT-003", description: "If the absolute difference between recorded and expected weight exceeds 5.0 kg, flag a discrepancy warning." }
  ],
  invariants: [
    "Total Weight must always be non-negative.",
    "If Qty > 0 and Unit Weight > 0, Total Weight cannot remain 0."
  ],
  expectedEffects: [
    "Auto-corrects missing weights and logs a correction count.",
    "Displays amber warnings on rows with weight discrepancies.",
    "Propagates verified weights to Executive KPI cards and Machine Tonnage charts."
  ],
  edgeCases: [
    { caseId: "EDGE-WT-ZERO-QTY", description: "Zero quantity with positive unit weight", input: { qty: 0, unitWeight: 10 } },
    { caseId: "EDGE-WT-STRING-COMMA", description: "Numeric weights formatted with commas such as 6,782.00", input: "6,782.00" },
    { caseId: "EDGE-WT-LARGE-ERROR", description: "Typo in recorded total weight (e.g. 1000 kg instead of 6782 kg)", input: { recorded: 1000, expected: 6782 } }
  ],
  persistenceBehavior: "In-memory audit state, exported into Cleaned Excel sheets.",
  calculationReferences: "Total Weight (kg) = Qty * Unit Weight (kg).",
  verificationPriority: "CRITICAL"
});

// 3. Operating Hours & Downtime Computation
registry.register({
  capabilityId: "CAP-HRS-DOWNTIME",
  name: "Operating Hours & Downtime Computation",
  description: "Validates 24-hour shift constraints, derives lost machine downtime hours, and flags unlogged stoppage reasons.",
  businessPurpose: "Monitor plant machine utilization and surface unrecorded downtime for continuous extrusion lines.",
  userActions: [
    "Upload shift hours per machine",
    "View derived downtime hours and stoppage reasons",
    "Inspect machine utilization % on the dashboard"
  ],
  inputs: [
    { field: "operatingHours", type: "number", example: 12 },
    { field: "reasonOfStop", type: "string", example: "Mold Changeover" }
  ],
  possibleStates: [
    { stateId: "FULL_SHIFT_24H", label: "24 hours operating -> 0 hours downtime" },
    { stateId: "PARTIAL_SHIFT_LOGGED", label: "Operating hours < 24 with recorded reason of stop" },
    { stateId: "PARTIAL_SHIFT_UNLOGGED", label: "Operating hours < 24 with empty reason of stop -> Flagged" },
    { stateId: "EXCESS_HOURS", label: "Operating hours > 24 -> Flagged as invalid shift duration" }
  ],
  dependencies: [],
  affectedModules: ["dataCleaner", "analyticsEngine", "CleaningAuditTable", "AnalyticsCharts", "KpiCards"],
  affectedViews: ["CleaningAuditTable", "AnalyticsCharts", "KpiCards"],
  businessRules: [
    { ruleId: "RULE-HRS-001", description: "Operating hours for a single machine shift must not exceed 24 hours." },
    { ruleId: "RULE-HRS-002", description: "Downtime Hours = Math.max(0, 24 - Operating Hours)." },
    { ruleId: "RULE-HRS-003", description: "If Downtime > 0 and Reason of Stop is empty, assign 'Unspecified' and flag an audit adjustment." }
  ],
  invariants: [
    "Operating Hours + Downtime Hours must equal 24 for any single daily machine entry.",
    "Operating Hours must be clamped between 0 and 24."
  ],
  expectedEffects: [
    "Generates Downtime Pareto chart in analytics.",
    "Calculates machine utilization rate in KPI cards: Operating Hours / Total Available Hours.",
    "Determines extrusion throughput speed (kg / Operating Hour)."
  ],
  edgeCases: [
    { caseId: "EDGE-HRS-OVER-24", description: "Operating hours recorded as 26", input: 26 },
    { caseId: "EDGE-HRS-ZERO", description: "Machine completely halted (0 operating hours)", input: 0 },
    { caseId: "EDGE-HRS-NEGATIVE", description: "Negative hours entered accidentally", input: -5 }
  ],
  persistenceBehavior: "In-memory state and included in Downtime Pareto Excel sheet.",
  calculationReferences: "OEE Availability standard: Available Time (24h) - Operating Time = Downtime.",
  verificationPriority: "HIGH"
});

// 4. Scrap & Quality Rejection Audit
registry.register({
  capabilityId: "CAP-SCRAP-AUDIT",
  name: "Scrap & Quality Rejection Audit",
  description: "Computes true scrap percentage based on total compounded raw material and alerts on high-waste production runs.",
  businessPurpose: "Control plastic raw material wastage (PVC/uPVC compound) and detect faulty extrusion start-ups.",
  userActions: [
    "Review total scrap kg and scrap rate % across lines and products",
    "Identify lines exceeding quality scrap thresholds (> 5%)"
  ],
  inputs: [
    { field: "totalWeight", type: "number", example: 2240 },
    { field: "scrapKg", type: "number", example: 40 }
  ],
  possibleStates: [
    { stateId: "ZERO_SCRAP", label: "0 kg scrap recorded (Clean continuous run)" },
    { stateId: "NORMAL_SCRAP", label: "Scrap <= 5% (Acceptable changeover / start-up waste)" },
    { stateId: "HIGH_SCRAP", label: "Scrap > 5% -> Highlighted in red with warning alert" }
  ],
  dependencies: ["CAP-MATH-AUDIT"],
  affectedModules: ["dataCleaner", "analyticsEngine", "CleaningAuditTable", "AnalyticsCharts", "KpiCards"],
  affectedViews: ["CleaningAuditTable", "AnalyticsCharts", "KpiCards"],
  businessRules: [
    { ruleId: "RULE-SCRAP-001", description: "Total Raw Material = Total Finished Weight + Scrap Weight." },
    { ruleId: "RULE-SCRAP-002", description: "Scrap % = (Scrap Weight / Total Raw Material) * 100." },
    { ruleId: "RULE-SCRAP-003", description: "If Scrap % > 5%, flag row with a high scrap warning." }
  ],
  invariants: [
    "Scrap % must always be between 0% and 100%.",
    "If Total Weight is 0 and Scrap > 0, Scrap % is 100%."
  ],
  expectedEffects: [
    "Calculates plant-wide overall scrap percentage in executive KPIs.",
    "Renders scrap bars alongside production in Machine Comparison chart.",
    "Flags scrap outliers in audit table."
  ],
  edgeCases: [
    { caseId: "EDGE-SCRAP-ZERO-PROD", description: "All output is scrap (e.g. trial run: 0 FG, 50 kg scrap)", input: { fg: 0, scrap: 50 } },
    { caseId: "EDGE-SCRAP-DECIMAL", description: "Fractional scrap weight (e.g. 15.5 kg)", input: 15.5 }
  ],
  persistenceBehavior: "In-memory state and exported into Cleaned Excel sheets.",
  calculationReferences: "Factory Yield Formula: Yield % = 100 - Scrap %.",
  verificationPriority: "HIGH"
});

// 5. Multi-Sheet Excel Targeting
registry.register({
  capabilityId: "CAP-SHEET-TARGET",
  name: "Multi-Sheet Excel Targeting",
  description: "Specifically identifies and extracts the 'Daily Production Log' worksheet from multi-sheet plant workbooks.",
  businessPurpose: "Prevent reading errors when workbooks contain auxiliary sheets like Machine_Master or Mixing Department.",
  userActions: [
    "Drop workbook containing multiple sheets into the file uploader",
    "Observe automatic selection of 'Daily Production Log' sheet"
  ],
  inputs: [
    { field: "sheetNames", type: "array", example: ["Machine_Master", "Daily Production Log", "Mixer Production"] }
  ],
  possibleStates: [
    { stateId: "EXACT_TARGET_FOUND", label: "Sheet 'Daily Production Log' found exactly" },
    { stateId: "FUZZY_TARGET_FOUND", label: "Sheet named 'Daily Production' or 'إنتاج' found via fuzzy match" },
    { stateId: "FALLBACK_FIRST", label: "Target sheet not found, fall back to first sheet with notice" }
  ],
  dependencies: [],
  affectedModules: ["FileUploader", "App"],
  affectedViews: ["FileUploader", "CleaningAuditTable"],
  businessRules: [
    { ruleId: "RULE-SHEET-001", description: "Prioritize exact case-insensitive match for 'Daily Production Log'." },
    { ruleId: "RULE-SHEET-002", description: "If exact match missing, search for sheets containing 'Daily' and 'Production'." },
    { ruleId: "RULE-SHEET-003", description: "Provide a dropdown to allow manual sheet switching if desired." }
  ],
  invariants: [
    "At least one sheet must be selected if the workbook contains sheets.",
    "Selected sheet must not be empty."
  ],
  expectedEffects: [
    "Displays sheet badge in the table toolbar.",
    "Parses row objects from the designated sheet exclusively."
  ],
  edgeCases: [
    { caseId: "EDGE-SHEET-WHITESPACE", description: "Sheet name has leading/trailing whitespace ' Daily Production Log '", input: " Daily Production Log " },
    { caseId: "EDGE-SHEET-ARABIC", description: "Sheet named in Arabic 'سجل الإنتاج اليومي'", input: "سجل الإنتاج اليومي" }
  ],
  persistenceBehavior: "Session state during file ingestion.",
  calculationReferences: "SheetJS XLSX Workbook SheetNames navigation.",
  verificationPriority: "HIGH"
});

// 6. Clean Multi-Sheet Excel Export
registry.register({
  capabilityId: "CAP-CLEAN-EXPORT",
  name: "Clean Multi-Sheet Excel Export",
  description: "Exports verified production logs with inserted Diameter & Thickness columns and aggregated machine summaries.",
  businessPurpose: "Provide management and ERP with certified, formula-verified Excel sheets ready for reporting.",
  userActions: [
    "Click 'Export Clean Excel' button",
    "Download .xlsx file containing verified logs and performance sheets"
  ],
  inputs: [
    { field: "cleanedRows", type: "array" },
    { field: "analytics", type: "object" }
  ],
  possibleStates: [
    { stateId: "READY_FOR_EXPORT", label: "Clean rows available -> Download button enabled" },
    { stateId: "EMPTY_DATA", label: "No records -> Download button disabled" }
  ],
  dependencies: ["CAP-DIM-EXTRACT", "CAP-MATH-AUDIT"],
  affectedModules: ["ExcelExporter", "App", "Navbar"],
  affectedViews: ["Navbar", "CleaningAuditTable"],
  businessRules: [
    { ruleId: "RULE-EXP-001", description: "Exported sheet must retain all original columns intact." },
    { ruleId: "RULE-EXP-002", description: "Exported sheet must insert 'Diameter' and 'Thickness' columns." },
    { ruleId: "RULE-EXP-003", description: "Primary worksheet must be named 'Daily Production Log'." }
  ],
  invariants: [
    "Total exported rows must equal total cleaned rows.",
    "Export file format must be valid binary .xlsx."
  ],
  expectedEffects: [
    "Triggers browser download of Cleaned_Pipe_Production_Report.xlsx.",
    "Generates multiple sheets: 'Cleaned Production Log' and 'Machine Performance'."
  ],
  edgeCases: [
    { caseId: "EDGE-EXP-SPECIAL-CHARS", description: "Quotes and inch symbols in product names inside cells", input: 'PVC 4" PIPE' }
  ],
  persistenceBehavior: "Downloads client-side generated .xlsx file.",
  calculationReferences: "SheetJS XLSX utils: json_to_sheet, book_append_sheet, writeFile.",
  verificationPriority: "HIGH"
});

// 7. Plant KPI & Cross-Module Aggregation
registry.register({
  capabilityId: "CAP-KPI-AGGREGATION",
  name: "Plant KPI & Cross-Module Aggregation",
  description: "Aggregates plant-wide metrics (total tonnage, piece count, average throughput kg/hr, utilization rate) across modules.",
  businessPurpose: "Give factory leadership a single source of truth for total extrusion volume and machine efficiency.",
  userActions: [
    "Filter records by date or machine",
    "Observe real-time updates across KPI cards, bar charts, and data tables"
  ],
  inputs: [
    { field: "cleanedRows", type: "array" }
  ],
  possibleStates: [
    { stateId: "ACTIVE_PRODUCTION", label: "Multiple records aggregated across lines" },
    { stateId: "SINGLE_MACHINE_FILTER", label: "Filtered to specific extruder" },
    { stateId: "ZERO_PRODUCTION", label: "No rows matching filter" }
  ],
  dependencies: ["CAP-MATH-AUDIT", "CAP-HRS-DOWNTIME", "CAP-SCRAP-AUDIT"],
  affectedModules: ["analyticsEngine", "KpiCards", "AnalyticsCharts", "App"],
  affectedViews: ["KpiCards", "AnalyticsCharts", "CleaningAuditTable"],
  businessRules: [
    { ruleId: "RULE-KPI-001", description: "Total Weight (Tons) = sum(Total Weight kg) / 1000." },
    { ruleId: "RULE-KPI-002", description: "Average Line Rate = sum(Total Weight kg) / sum(Operating Hours)." },
    { ruleId: "RULE-KPI-003", description: "Machine Utilization % = (Total Operating Hours / (Operating + Downtime Hours)) * 100." }
  ],
  invariants: [
    "Sum of machine weights must equal overall plant total weight.",
    "Total pieces must equal sum of individual record quantities."
  ],
  expectedEffects: [
    "Updates all 6 KPI cards simultaneously.",
    "Re-renders machine output bar chart and daily trend area chart."
  ],
  edgeCases: [
    { caseId: "EDGE-KPI-ZERO-HOURS", description: "Operating hours = 0 avoids divide-by-zero for line rate", input: { totalWeight: 500, hours: 0 } }
  ],
  persistenceBehavior: "Dynamically recomputed from cleaned rows state.",
  calculationReferences: "Plant KPI Aggregation: Tons = kg / 1000; Throughput = kg / run_hrs.",
  verificationPriority: "CRITICAL"
});

// 8. Interactive Manual Record Entry
registry.register({
  capabilityId: "CAP-MANUAL-ENTRY",
  name: "Interactive Manual Record Entry",
  description: "Allows operators to manually log shifts or test new pipe specs with real-time auto-calculation of total weight.",
  businessPurpose: "Enable immediate data logging without requiring an existing Excel sheet.",
  userActions: [
    "Click 'Add Row / إدخال يدوي'",
    "Fill modal form (Product, Machine, Qty, Unit Weight)",
    "Watch Total Weight auto-calculate, then submit into audit stream"
  ],
  inputs: [
    { field: "date", type: "string" },
    { field: "product", type: "string" },
    { field: "machine", type: "string" },
    { field: "qty", type: "number" },
    { field: "unitWeight", type: "number" }
  ],
  possibleStates: [
    { stateId: "VALID_ENTRY", label: "All required fields filled, total weight auto-multiplied" },
    { stateId: "INCOMPLETE_ENTRY", label: "Missing required fields -> Form submission blocked" }
  ],
  dependencies: ["CAP-DIM-EXTRACT", "CAP-MATH-AUDIT"],
  affectedModules: ["ManualEntryModal", "dataCleaner", "App"],
  affectedViews: ["ManualEntryModal", "CleaningAuditTable", "KpiCards"],
  businessRules: [
    { ruleId: "RULE-MAN-001", description: "Changing Qty or Unit Weight in the modal auto-computes Total Weight in real time." },
    { ruleId: "RULE-MAN-002", description: "Submitted manual row is prepended to the active dataset and passes through the full audit pipeline." }
  ],
  invariants: [
    "Submitted row must possess all required pipeline fields.",
    "Pipeline item count increments by exactly 1 upon valid submission."
  ],
  expectedEffects: [
    "Modal closes and new row appears with dimension badges in preview table.",
    "KPI cards and charts re-aggregate instantly."
  ],
  edgeCases: [
    { caseId: "EDGE-MAN-DECIMAL-QTY", description: "Handling non-integer quantity input gracefully", input: 12.5 }
  ],
  persistenceBehavior: "Prepend to in-memory active raw rows state.",
  calculationReferences: "UI reactive state multiplication: Qty * UnitWeight.",
  verificationPriority: "MEDIUM"
});
