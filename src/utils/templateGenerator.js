import * as XLSX from 'xlsx';

/**
 * Generates the standardized Daily Production Log Excel template
 * Designed for shop-floor supervisors and machine operators.
 */
export function generateDailyProductionLogTemplate() {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Date',
    'Line ID',
    'Shift',
    'Product Code',
    'Product Description',
    'Nominal OD (mm)',
    'Wall Thickness (mm)',
    'Pipe Length (m)',
    'Extruder Speed (m/min)',
    'Operating Hours',
    'Total Production Qty (Pcs)',
    'Total Weight (kg)',
    'Scrap / Rejection (kg)',
    'Downtime Minutes',
    'Reason of Stop'
  ];

  const sampleRows = [
    [
      '2026-09-23',
      'Line 5',
      'Shift 1',
      'PVC-110-PN10',
      'PVC Pressure Pipe 110mm x 4.2mm Class 4',
      110,
      4.2,
      6.0,
      2.4,
      12,
      288,
      3450,
      45,
      30,
      'Filter Screen Change'
    ],
    [
      '2026-09-23',
      'Line 3',
      'Shift 1',
      'PVC-020-WH-HD',
      'PVC Electrical Conduit 20mm White Heavy Duty',
      20,
      1.8,
      3.0,
      14.5,
      12,
      3480,
      1320,
      18,
      0,
      ''
    ],
    [
      '2026-09-23',
      'Line 7',
      'Shift 2',
      'PVC-160-PN16',
      'PVC Pressure Pipe 160mm x 9.5mm PN16',
      160,
      9.5,
      6.0,
      1.2,
      12,
      144,
      4820,
      60,
      45,
      'Die Calibration & Purging'
    ]
  ];

  const wsData = [headers, ...sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 14 }, // Date
    { wch: 14 }, // Line ID
    { wch: 12 }, // Shift
    { wch: 18 }, // Product Code
    { wch: 45 }, // Product Description
    { wch: 18 }, // Nominal OD (mm)
    { wch: 22 }, // Wall Thickness (mm)
    { wch: 16 }, // Pipe Length (m)
    { wch: 24 }, // Extruder Speed (m/min)
    { wch: 16 }, // Operating Hours
    { wch: 26 }, // Total Production Qty (Pcs)
    { wch: 22 }, // Total Weight (kg)
    { wch: 24 }, // Scrap / Rejection (kg)
    { wch: 20 }, // Downtime Minutes
    { wch: 32 }  // Reason of Stop
  ];

  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Production Log');

  // Instructions Sheet
  const instructions = [
    ['PVC Production Suite - Daily Log Template Instructions'],
    [''],
    ['Field', 'Required', 'Format / Example', 'Description'],
    ['Date', 'Yes', 'YYYY-MM-DD (e.g. 2026-09-23)', 'Production date of the run'],
    ['Line ID', 'Yes', 'Line 1, Line 2, ..., Line 9', 'Extruder line number or machine identifier'],
    ['Shift', 'Optional', 'Shift 1 / Shift 2 / 24H', 'Shift identifier (Shift 1 = Morning, Shift 2 = Night)'],
    ['Product Code', 'Yes', 'e.g. PVC-110-PN10', 'Factory SKU or finished goods code'],
    ['Product Description', 'Yes', 'e.g. PVC Pressure Pipe 110mm x 4.2mm', 'Full nominal product specification'],
    ['Nominal OD (mm)', 'Recommended', 'Number (e.g. 110)', 'Outer diameter in millimeters'],
    ['Wall Thickness (mm)', 'Recommended', 'Number (e.g. 4.2)', 'Wall thickness in millimeters'],
    ['Pipe Length (m)', 'Recommended', 'Number (e.g. 6.0)', 'Cut length in meters (standard is 5.8m or 6.0m)'],
    ['Extruder Speed (m/min)', 'Recommended', 'Number (e.g. 2.4)', 'Linear extrusion haul-off velocity in meters per minute'],
    ['Operating Hours', 'Yes', 'Number (e.g. 12 or 24)', 'Net extrusion running hours excluding downtime'],
    ['Total Production Qty (Pcs)', 'Yes', 'Integer (e.g. 288)', 'Good pieces accepted and packed'],
    ['Total Weight (kg)', 'Yes', 'Number (e.g. 3450)', 'Total gross weight of accepted product in kilograms'],
    ['Scrap / Rejection (kg)', 'Optional', 'Number (e.g. 45)', 'Start-up lumps, out-of-spec scrap, and reject pieces'],
    ['Downtime Minutes', 'Optional', 'Number (e.g. 30)', 'Total machine stoppage minutes during shift'],
    ['Reason of Stop', 'Optional', 'Text', 'Downtime category or stoppage notes']
  ];

  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  wsInstructions['!cols'] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 36 },
    { wch: 60 }
  ];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

  return wb;
}

/**
 * Generates the standardized ERP Import Formatting Excel template
 * Designed for historical log integration without recorded extruder lines.
 */
export function generateErpImportTemplate() {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Date',
    'Item Code',
    'Product Description',
    'Quantity (Pcs)',
    'Unit Weight (kg)',
    'Total Weight (kg)',
    'Operating Hours',
    'Scrap (kg)',
    'Reason of Stop'
  ];

  const sampleRows = [
    [
      '2026-09-23',
      '100452',
      'PVC Pressure Pipe 160mm x 6.2mm PN10 DIN 8062',
      450,
      28.5,
      12825,
      24,
      120,
      'Normal continuous production'
    ],
    [
      '2026-09-23',
      '100789',
      'PVC Drainage Pipe 110mm x 3.2mm Class B',
      1200,
      10.2,
      12240,
      24,
      95,
      'Routine screen change'
    ],
    [
      '2026-09-23',
      '100115',
      'PVC Electrical Conduit 25mm Medium Duty Gray',
      2400,
      0.85,
      2040,
      20,
      40,
      'Printing ink replenishment'
    ]
  ];

  const wsData = [headers, ...sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 14 }, // Date
    { wch: 16 }, // Item Code
    { wch: 50 }, // Product Description
    { wch: 18 }, // Quantity (Pcs)
    { wch: 18 }, // Unit Weight (kg)
    { wch: 20 }, // Total Weight (kg)
    { wch: 18 }, // Operating Hours
    { wch: 16 }, // Scrap (kg)
    { wch: 35 }  // Reason of Stop
  ];

  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  XLSX.utils.book_append_sheet(wb, ws, 'ERP Import Data');

  const guidance = [
    ['PVC Machine Inference Engine - ERP Import Guidance'],
    [''],
    ['1. Line Assignment Automation: When ERP logs lack extruder line numbers, the system uses the Inference Engine.'],
    ['2. Diameter Envelope Matching: The engine extracts outer diameter from the Product Description and compares against machine physical tooling envelopes (Min OD - Max OD).'],
    ['3. Theoretical Loading Optimization: The engine scores candidate lines to match the optimal 65% - 95% nominal extrusion capacity envelope.'],
    ['4. Recommended Fields: Having clear descriptions like "110mm x 4.2mm" guarantees 100% inference accuracy.']
  ];
  const wsGuidance = XLSX.utils.aoa_to_sheet(guidance);
  wsGuidance['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, wsGuidance, 'Inference Guidance');

  return wb;
}

/**
 * Generates an engineering calculation reference specification workbook
 */
export function generateCalculationGuideWorkbook() {
  const wb = XLSX.utils.book_new();

  const formulaRows = [
    ['PVC Pipe Production Suite - Engineering Calculations & Formulas Reference'],
    [''],
    ['Parameter', 'Formula / Equation', 'Standard Units', 'Description / Engineering Rationale'],
    [
      'Target Hourly Output Rate',
      'Rate (Pcs/Hr) = (Speed [m/min] * 60) / Cut Length [m]',
      'Pieces / Hour',
      'Calculates linear cycle pieces based on line haul-off speed and cutting saw pitch.'
    ],
    [
      'Cut Time per Pipe',
      'Cut Time (sec) = (Cut Length [m] / Speed [m/min]) * 60 = 3600 / Target Pcs/Hr',
      'Seconds / Pipe',
      'Time elapsed between consecutive saw cuts on the planetary cutter.'
    ],
    [
      'Theoretical Pipe Weight per Meter',
      'Weight (kg/m) = PI * (OD [mm] - WT [mm]) * WT [mm] * Density / 1000',
      'kg / Meter',
      'Standard volume of cylinder wall multiplied by rigid PVC density (~1.43 g/cm3).'
    ],
    [
      'Theoretical Weight per Piece',
      'Weight/Pcs (kg) = Theoretical Weight (kg/m) * Cut Length [m]',
      'kg / Piece',
      'Expected weight of one finished extruded length before socket/bell.'
    ],
    [
      'Hourly Mass Extrusion Rate',
      'Mass Rate (kg/hr) = Target Pcs/Hr * Weight/Pcs (kg) = Speed [m/min] * 60 * Weight (kg/m)',
      'kg / Hour',
      'Total polymer throughput extruded through the die head.'
    ],
    [
      'Machine Capacity Loading Ratio',
      'Loading Ratio (%) = (Actual Rate [kg/hr] / Machine Nominal Capacity [kg/hr]) * 100',
      'Percentage (%)',
      'Evaluates extruder thermal and screw drive utilization. Optimal window is 65% to 95%.'
    ],
    [
      'Overall Equipment Effectiveness (OEE)',
      'OEE (%) = Availability (%) * Performance (%) * Quality (%)',
      'Percentage (%)',
      'Comprehensive plant manufacturing efficiency indicator.'
    ],
    [
      'Standard Shift Target (DOC-Ext.-03)',
      'Target Shift Pcs = Target Pcs/Hr * Available Operating Hours',
      'Pieces / Shift',
      'Baseline benchmark pieces printed on Morning SOP follow sheets.'
    ]
  ];

  const ws = XLSX.utils.aoa_to_sheet(formulaRows);
  ws['!cols'] = [
    { wch: 32 },
    { wch: 55 },
    { wch: 22 },
    { wch: 75 }
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: 2, topLeftCell: 'A3', activePane: 'bottomLeft', state: 'frozen' };
  XLSX.utils.book_append_sheet(wb, ws, 'Engineering Formulas');

  // Matrix of typical PVC pipe sizes and calculations
  const matrixHeaders = [
    'Nominal Size',
    'Standard Class',
    'Outer Diameter (mm)',
    'Wall Thickness (mm)',
    'Length (m)',
    'Typical Speed (m/min)',
    'Calculated Cut Time (s)',
    'Target Output (Pcs/Hr)',
    'Theoretical Wt (kg/m)',
    'Theoretical Wt/Pcs (kg)',
    'Extrusion Rate (kg/hr)',
    'Recommended Extruder'
  ];

  const matrixRows = [
    ['20mm Conduit', 'Medium Duty', 20, 1.8, 3.0, 16.0, 11.3, 320, 0.147, 0.441, 141.1, 'Line 1 (KTS 350)'],
    ['25mm Conduit', 'Heavy Duty', 25, 2.2, 3.0, 12.5, 14.4, 250, 0.228, 0.684, 171.0, 'Line 1 (KTS 350)'],
    ['32mm Pressure', 'PN10', 32, 2.0, 6.0, 8.5, 42.4, 85, 0.273, 1.638, 139.2, 'Line 2 (KTS 450)'],
    ['50mm Pressure', 'PN10', 50, 2.4, 6.0, 5.8, 62.1, 58, 0.518, 3.108, 180.3, 'Line 2 (KTS 450)'],
    ['63mm Pressure', 'PN16', 63, 4.7, 6.0, 4.0, 90.0, 40, 1.238, 7.428, 297.1, 'Line 3 (KTS 550)'],
    ['110mm Pressure', 'PN10', 110, 4.2, 6.0, 2.4, 150.0, 24, 2.016, 12.096, 290.3, 'Line 5 (KTS 600)'],
    ['160mm Pressure', 'PN10', 160, 6.2, 6.0, 1.35, 266.7, 13.5, 4.318, 25.908, 349.8, 'Line 6 (KTS 650)'],
    ['200mm Drainage', 'Class B', 200, 4.9, 6.0, 1.1, 327.3, 11.0, 4.329, 25.974, 285.7, 'Line 7 (KTS 700)'],
    ['250mm Pressure', 'PN10', 250, 9.6, 6.0, 0.65, 553.8, 6.5, 10.450, 62.700, 407.6, 'Line 8 (Battenfeld 90)'],
    ['315mm Pressure', 'PN10', 315, 12.1, 6.0, 0.42, 857.1, 4.2, 16.592, 99.552, 418.1, 'Line 9 (Cincinnati 90)']
  ];

  const wsMatrix = XLSX.utils.aoa_to_sheet([matrixHeaders, ...matrixRows]);
  wsMatrix['!cols'] = matrixHeaders.map(() => ({ wch: 22 }));
  wsMatrix['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  XLSX.utils.book_append_sheet(wb, wsMatrix, 'Sample Standards Matrix');

  return wb;
}
