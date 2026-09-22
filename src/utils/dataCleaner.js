import { evaluateMachineSizing, BLACKLISTED_STANDARD_NUMBERS, canonicalizeMachineName, isUnknownMachine } from './masterProfiles.js';

/**
 * Standardizes raw material strings into unified case-consistent values.
 * Consolidates all variations of PVC ("PVC", "uPVC", "UPVC", "pvc", "upvc", "PVC-U", "U-PVC") into "uPVC".
 */
export function standardizeMaterial(rawMaterial, desc = '') {
  const text = String(rawMaterial || '').trim().toUpperCase();
  const descText = String(desc || '').trim().toUpperCase();
  const combined = `${text} ${descText}`;

  if (combined.includes('HDPE')) return 'HDPE';
  if (combined.includes('CPVC')) return 'CPVC';
  if (combined.includes('PPR')) return 'PPR';
  if (
    combined.includes('UPVC') || 
    combined.includes('U-PVC') || 
    combined.includes('PVC-U') || 
    combined.includes('PVC')
  ) {
    return 'uPVC';
  }
  return text || 'uPVC';
}

/**
 * Strictly filters out non-pipe and junk items from production planning catalogs and reports.
 * Excludes items containing "COMPOUND", "Unknown Product", missing descriptions,
 * or cable ducting/jacketing accessories ("JACKET", "W/SLICON", "OUTER JACKET").
 * Keeps only authentic PVC/uPVC pipe and conduit profiles (must contain "PIPE" or "CONDUIT" or standard pipe OD specs).
 */
export function isValidPipeOrConduitProduct(productDesc, diameter = null, diameterMm = null) {
  if (!productDesc || typeof productDesc !== 'string') return false;
  const desc = productDesc.trim();
  if (!desc) return false;

  const upper = desc.toUpperCase();

  // 1. Strictly exclude unknown product or missing descriptions
  if (
    upper === 'UNKNOWN PRODUCT' || 
    upper === 'UNKNOWN' || 
    upper.startsWith('UNKNOWN PRODUCT') ||
    upper === 'STANDARD PIPE'
  ) {
    return false;
  }

  // 2. Strictly exclude compound formulations (e.g., PVC COMPOUND FOR INJECTION...)
  if (upper.includes('COMPOUND')) {
    return false;
  }

  // 3. Strictly exclude cable ducting/jacketing accessories & silicon lines
  // (e.g., "JACKET", "OUTER JACKET", "W/SLICON", "W/SILICON", "SILICON", "SLICON")
  if (
    upper.includes('JACKET') || 
    upper.includes('OUTER JACKET') || 
    upper.includes('W/SLICON') || 
    upper.includes('W/SILICON') || 
    upper.includes('SLICON') ||
    upper.includes('SILICON') ||
    upper.includes('ACCESSORY') ||
    upper.includes('ACCESSORIES')
  ) {
    return false;
  }

  // 4. Must be authentic PVC/uPVC pipe or conduit profile:
  // Must contain "PIPE" or "CONDUIT" (or Arabic equivalents) OR standard pipe OD specs
  const hasPipeOrConduitKeyword = 
    upper.includes('PIPE') || 
    upper.includes('CONDUIT') || 
    upper.includes('ماسورة') || 
    upper.includes('مواسير') ||
    upper.includes('خرطوم');

  if (hasPipeOrConduitKeyword) {
    return true;
  }

  // If keyword isn't explicit, check if it has genuine pipe OD and standard spec indicators
  const dMm = (diameterMm !== undefined && diameterMm !== null && diameterMm > 0)
    ? diameterMm
    : (diameter && diameter !== '-' ? parseFloat(diameter) : null);

  const hasStandardSpec = 
    upper.includes('SCH') || 
    upper.includes('PN') || 
    upper.includes('SDR') || 
    upper.includes('ISO') || 
    upper.includes('ASTM') || 
    upper.includes('SASO') || 
    upper.includes('DIN');

  if (dMm !== null && dMm > 0 && hasStandardSpec) {
    return true;
  }

  return false;
}

/**
 * Normalizes Excel date values (serial number or string) to YYYY-MM-DD
 */
export function normalizeDate(val) {
  if (!val) return "";

  // If already YYYY-MM-DD
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
    return val.trim();
  }

  // If Excel serial number (e.g. 45542)
  if (typeof val === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  // If date object
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }

  // Parse common string formats: DD/MM/YYYY, MM/DD/YYYY, YYYY/MM/DD
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(/\//g, '-');
    const parts = cleaned.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        const y = parts[0];
        const m = parts[1].padStart(2, '0');
        const d = parts[2].padStart(2, '0');
        return `${y}-${m}-${d}`;
      } else if (parts[2].length === 4) {
        // DD-MM-YYYY or MM-DD-YYYY
        const y = parts[2];
        const p1 = parts[0].padStart(2, '0');
        const p2 = parts[1].padStart(2, '0');
        // If p1 > 12, it must be DD-MM-YYYY
        if (parseInt(p1) > 12) {
          return `${y}-${p2}-${p1}`;
        }
        return `${y}-${p1}-${p2}`;
      }
    }
  }

  return String(val).trim();
}

/**
 * Safely parses numeric fields, removing commas, spaces, currency symbols
 */
export function parseNumber(val, defaultVal = 0) {
  if (val === null || val === undefined || val === '') return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;

  const cleanStr = String(val)
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '')
    .trim();

  const num = parseFloat(cleanStr);
  return isNaN(num) ? defaultVal : num;
}

/**
 * Extracts pipe material, diameter and thickness from product spec string
 * Handles:
 * 1. Metric cross notation (e.g., 110x5.3, 50x2.4 -> Diameter: 110 mm, Thickness: 5.3 mm)
 * 2. Metric with separate MM units (e.g., 75MM PN10X3.6MM, 75MM 2.2MM -> Diameter: 75 mm, Thickness: 3.6 mm / 2.2 mm)
 * 3. Imperial sizes with schedules or SDR (e.g., 4" PIPE SDR 26, PVC PIPE 3/4"SCH40, MANARCO PVC PIPE 3" SCH 40 -> Diameter: 4", 3/4", 3" & Thickness: SDR 26, SCH 40)
 */
export function parseProductSpecs(desc) {
  if (!desc || typeof desc !== 'string') {
    return { material: 'uPVC', diameter: '-', thickness: '-', size: 'Unknown', standard: 'N/A' };
  }

  // 1. Sanitize: replace all \r\n, \n, and consecutive whitespace with a single space
  let text = String(desc)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize Eastern Arabic numerals
  const easternArabicNumerals = [/\u0660/g, /\u0661/g, /\u0662/g, /\u0663/g, /\u0664/g, /\u0665/g, /\u0666/g, /\u0667/g, /\u0668/g, /\u0669/g];
  for (let i = 0; i < 10; i++) {
    text = text.replace(easternArabicNumerals[i], String(i));
  }

  const upper = text.toUpperCase();

  // Material detection & unification to 'uPVC' (HDPE, PPR, CPVC preserved)
  let material = 'uPVC';
  if (upper.includes('HDPE') || upper.includes('PE100') || upper.includes('PE80') || upper.includes('PE-100') || upper.includes('PE-80') || upper.includes('POLYETHYLENE') || upper.includes('إيثيلين')) {
    material = 'HDPE';
  } else if (upper.includes('UPVC') || upper.includes('U-PVC') || upper.includes('PVC-U') || upper.includes('PVC') || upper.includes('يو بي في سي') || upper.includes('بي في سي')) {
    material = 'uPVC';
  } else if (upper.includes('PPR') || upper.includes('PP-R') || upper.includes('بروبلين')) {
    material = 'PPR';
  } else if (upper.includes('CPVC') || upper.includes('C-PVC')) {
    material = 'CPVC';
  } else if (/\bSDR[\s-]*\d+/i.test(text) && !upper.includes('PVC')) {
    material = 'HDPE';
  }

  let diameter = '';
  let thickness = '';

  // 1. Thickness detection: SDR or Schedule
  const sdrSchMatch = text.match(/\b(SDR[\s-]*\d+(?:\.\d+)?|SCH(?:EDULE)?[\s-]*\d+)\b/i);
  if (sdrSchMatch) {
    const raw = sdrSchMatch[1].toUpperCase();
    if (raw.startsWith('SDR')) {
      thickness = raw.includes('-') ? raw.replace(/\s*-\s*/, '-') : raw.replace(/\s+/, ' ');
    } else {
      thickness = raw.replace(/\s+/, ' ').replace(/SCH[\s-]*(\d+)/i, 'SCH $1');
    }
  }

  // 2. Arabic thickness prefix (e.g. thickness 5.3 mm)
  if (!thickness) {
    const arThickMatch = text.match(/\b(?:سمك|سماكة)\s*(\d+(?:\.\d+)?)\s*(?:MM|mm|مم|ملم)?\b/i);
    if (arThickMatch) {
      thickness = `${arThickMatch[1]} mm`;
    }
  }

  // 3. Prioritize explicit inch sizes:
  // e.g. 4", 3/4", 3", 1/2", 1 1/2", 1-1/4", 2-1/2"
  const imperialRegex = /(?:^|[\s_/-])((\d+(?:[\s-]+\d+\/\d+|\/\d+)?|\d+(?:\.\d+)?)\s*(?:"|''|\binch(?:es)?\b|\bin\b|بوص[ةه]))/gi;
  let impMatch;
  while ((impMatch = imperialRegex.exec(text)) !== null) {
    const rawVal = impMatch[1].replace(/''/g, '"').replace(/\s*inch(?:es)?|\s*in\b|\s*بوص[ةه]/gi, '"').trim();
    const cleanNum = rawVal.replace(/"/g, '').trim();
    if (!BLACKLISTED_STANDARD_NUMBERS.includes(cleanNum)) {
      diameter = rawVal.endsWith('"') ? rawVal : `${rawVal}"`;
      break;
    }
  }

  // Check SCH / SDR with adjacent inch size without quotes (e.g., "ASTM D 1785 / SCH 40 2" or "SCH 40 2" or "2 SCH 40")
  if (!diameter) {
    const schInchMatch = text.match(/(?:SCH(?:EDULE)?\s*\d+|SDR\s*\d+)[^\d]+(\d+(?:[\s-]+\d+\/\d+|\/\d+)?)(?!\s*mm|\s*x|\s*\d)/i) ||
                         text.match(/(?:^|[\s_/-])(\d+(?:[\s-]+\d+\/\d+|\/\d+)?)[^\d]+(?:SCH(?:EDULE)?\s*\d+|SDR\s*\d+)/i);
    if (schInchMatch) {
      const cand = schInchMatch[1].trim();
      if (!BLACKLISTED_STANDARD_NUMBERS.includes(cand)) {
        const numVal = parseFloat(cand.split('/')[0]);
        if (numVal <= 24 && !cand.includes('1785') && !cand.includes('2241')) {
          diameter = `${cand}"`;
        }
      }
    }
  }

  // 4. Metric cross notation: e.g. 110x5.3, 50x2.4, 160*14.6, 315X15mm
  if (!diameter) {
    const crossMatch = text.match(/\b(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)(?:\s*(?:mm|مم|ملم))?(?!\d)/i);
    if (crossMatch && !BLACKLISTED_STANDARD_NUMBERS.includes(crossMatch[1])) {
      diameter = `${crossMatch[1]} mm`;
      if (!thickness) thickness = `${crossMatch[2]} mm`;
    }
  }

  // 5. Explicit DN / OD / D / Ø notation: e.g. "DN 160", "DN160", "OD 160", "Ø 160", "D 160"
  if (!diameter) {
    const dnOdMatch = text.match(/\b(?:DN|OD|D|\u00D8)[\s-]*(\d+(?:\.\d+)?)\s*(?:MM|mm|مم|ملم)?\b/i);
    if (dnOdMatch && !BLACKLISTED_STANDARD_NUMBERS.includes(dnOdMatch[1])) {
      diameter = `${dnOdMatch[1]} mm`;
    }
  }

  // 6. Arabic diameter prefix (e.g. قطر 110 mm)
  if (!diameter) {
    const arDiamMatch = text.match(/\bقطر\s*(\d+(?:\.\d+)?)\s*(?:MM|mm|مم|ملم)?\b/i);
    if (arDiamMatch && !BLACKLISTED_STANDARD_NUMBERS.includes(arDiamMatch[1])) {
      diameter = `${arDiamMatch[1]} mm`;
    }
  }

  // 7. Metric with separate MM units: e.g. "75MM PN10X3.6MM", "75MM 2.2MM", "160 MM"
  if (!diameter) {
    const twoMmMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:MM|مم|ملم)\b[^\d]*?(\d+(?:\.\d+)?)\s*(?:MM|مم|ملم)\b/i);
    const mmWithXMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:MM|مم|ملم)\b.*?[xX*×]\s*(\d+(?:\.\d+)?)(?:\s*(?:MM|مم|ملم))?\b/i);

    if (twoMmMatch && !BLACKLISTED_STANDARD_NUMBERS.includes(twoMmMatch[1])) {
      diameter = `${twoMmMatch[1]} mm`;
      if (!thickness) thickness = `${twoMmMatch[2]} mm`;
    } else if (mmWithXMatch && !BLACKLISTED_STANDARD_NUMBERS.includes(mmWithXMatch[1])) {
      diameter = `${mmWithXMatch[1]} mm`;
      if (!thickness) thickness = `${mmWithXMatch[2]} mm`;
    } else {
      const mmRegex = /\b(\d+(?:\.\d+)?)\s*(?:MM|mm|مم|ملم)\b/gi;
      let singleMm;
      while ((singleMm = mmRegex.exec(text)) !== null) {
        if (!BLACKLISTED_STANDARD_NUMBERS.includes(singleMm[1])) {
          diameter = `${singleMm[1]} mm`;
          break;
        }
      }
    }
  }

  // 8. Number directly preceding SDR / SCH / PN (e.g., "160 SDR 11", "200 SDR-17")
  if (!diameter) {
    const numBeforeSdr = text.match(/\b(\d+(?:\.\d+)?)\s*(?:MM|mm|مم|ملم)?\s*(?:SDR|SCH|PN|CLASS|SN\d)\b/i);
    if (numBeforeSdr && !BLACKLISTED_STANDARD_NUMBERS.includes(numBeforeSdr[1])) {
      diameter = `${numBeforeSdr[1]} mm`;
    }
  }

  // 9. Known standard metric pipe sizes: 16 to 1200 mm
  if (!diameter) {
    const standardSizes = [1200, 1000, 900, 800, 710, 630, 560, 500, 450, 400, 355, 315, 280, 250, 225, 200, 180, 160, 140, 125, 110, 90, 75, 63, 50, 40, 32, 25, 20, 16];
    for (const sz of standardSizes) {
      const re = new RegExp(`\\b${sz}\\b`);
      if (re.test(text) && !BLACKLISTED_STANDARD_NUMBERS.includes(String(sz))) {
        const isSdrVal = new RegExp(`SDR[\\s-]*${sz}\\b`, 'i').test(text);
        const isPnVal = new RegExp(`PN[\\s-]*${sz}\\b`, 'i').test(text);
        const isPeVal = new RegExp(`PE[\\s-]*${sz}\\b`, 'i').test(text);
        const isSchVal = new RegExp(`SCH(?:EDULE)?[\\s-]*${sz}\\b`, 'i').test(text);
        if (!isSdrVal && !isPnVal && !isPeVal && !isSchVal) {
          diameter = `${sz} mm`;
          break;
        }
      }
    }
  }

  // Thickness fallback if still missing
  if (!thickness) {
    const wallMm = text.match(/\b(\d+\.\d+)\s*(?:MM|mm|مم|ملم)?\b/i);
    if (wallMm && (!diameter || wallMm[1] !== diameter.replace(/[^\d.]/g, ''))) {
      thickness = `${wallMm[1]} mm`;
    }
  }

  // Standard detection
  let standard = 'N/A';
  if (upper.includes('ASTM D 1785') || upper.includes('ASTMD 1785') || upper.includes('ASTM D1785') || upper.includes('D1785')) {
    standard = 'ASTM D1785';
  } else if (upper.includes('ASTM D 2241') || upper.includes('ASTMD 2241') || upper.includes('ASTM D2241') || upper.includes('D2241')) {
    standard = 'ASTM D2241';
  } else if (upper.includes('ISO 1452') || upper.includes('SASO-ISO') || upper.includes('1452')) {
    standard = 'ISO 1452';
  } else if (upper.includes('PN-12.5') || upper.includes('PN12.5') || upper.includes('PN 12.5')) standard = 'PN 12.5';
  else if (upper.includes('PN-16') || upper.includes('PN16') || upper.includes('PN 16')) standard = 'PN 16';
  else if (upper.includes('PN-10') || upper.includes('PN10') || upper.includes('PN 10')) standard = 'PN 10';
  else if (upper.includes('PN-6') || upper.includes('PN6') || upper.includes('PN 6')) standard = 'PN 6';
  else if (upper.includes('SCH 40') || upper.includes('SCH40') || upper.includes('SCH-40')) standard = 'SCH 40';
  else if (upper.includes('SCH 80') || upper.includes('SCH80') || upper.includes('SCH-80')) standard = 'SCH 80';
  else if (upper.includes('SDR 26') || upper.includes('SDR26') || upper.includes('SDR-26')) standard = 'SDR 26';
  else if (upper.includes('SDR 11') || upper.includes('SDR11') || upper.includes('SDR-11')) standard = 'SDR 11';
  else if (upper.includes('SDR 17') || upper.includes('SDR17') || upper.includes('SDR-17')) standard = 'SDR 17';
  else if (upper.includes('SDR 21') || upper.includes('SDR21') || upper.includes('SDR-21')) standard = 'SDR 21';
  else if (upper.includes('SDR 9') || upper.includes('SDR9') || upper.includes('SDR-9')) standard = 'SDR 9';

  // Final sanity check: diameter must NEVER be a blacklisted standard number
  if (diameter) {
    const rawNum = diameter.replace(/[^\d.]/g, '');
    if (BLACKLISTED_STANDARD_NUMBERS.includes(rawNum)) {
      diameter = '-';
    }
  }

  return { 
    material, 
    diameter: diameter || '-', 
    thickness: thickness || '-', 
    size: diameter || 'Other', 
    standard 
  };
}

/**
 * Scans up to the first 5 rows of a worksheet to locate the actual header row
 * and converts subsequent rows to structured JSON objects.
 * Handles files with top logos, banners, or metadata in rows 1-4.
 */
export function parseSheetToJsonWithDynamicHeader(sheet, XLSX) {
  if (!sheet || !XLSX) return [];

  const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rawMatrix || !Array.isArray(rawMatrix) || rawMatrix.length === 0) return [];

  const headerMarkers = [
    'product name', 'product code', 'totalweight', 'total weight',
    'doc date', 'docdate', 'doc no', 'item code', 'product description',
    'qty', 'quantity', 'unit weight', 'weight',
    '\u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641',
    '\u0643\u0648\u062f \u0627\u0644\u0635\u0646\u0641',
    '\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0648\u0632\u0646',
    '\u0627\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0648\u0632\u0646',
    '\u0627\u0644\u0643\u0645\u064a\u0629',
    '\u062a\u0627\u0631\u064a\u062e'
  ];

  let headerRowIndex = 0;
  const maxScanRows = Math.min(5, rawMatrix.length);

  for (let r = 0; r < maxScanRows; r++) {
    const row = rawMatrix[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const rowNormalized = row
      .map(cell => String(cell || '').trim().toLowerCase())
      .join(' ');

    const hasMatch = headerMarkers.some(kw => rowNormalized.includes(kw));
    if (hasMatch) {
      headerRowIndex = r;
      break;
    }
  }

  const rawHeaders = rawMatrix[headerRowIndex] || [];
  const headers = rawHeaders.map((h, i) => {
    const str = String(h ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    return str || `__EMPTY_${i}`;
  });

  const parsedRows = [];
  for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
    const row = rawMatrix[r];
    if (!Array.isArray(row)) continue;

    const hasData = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
    if (!hasData) continue;

    const rowObj = {};
    headers.forEach((header, c) => {
      if (header) {
        rowObj[header] = row[c] !== undefined ? row[c] : '';
      }
    });
    parsedRows.push(rowObj);
  }

  return parsedRows;
}

/**
 * Detects headers from raw sheet rows flexibly
 */
export function matchColumns(rowObj) {
  if (!rowObj || typeof rowObj !== 'object') return {};
  const keys = Object.keys(rowObj);
  const mapping = {};

  const cleanKey = (k) => String(k).replace(/[\r\n]+/g, ' ').trim().toLowerCase().replace(/[\s_()-]+/g, '');

  // Priority check for explicit Machine Name column (to avoid capturing Line ID e.g. L-01, L-02 as machine)
  for (const k of keys) {
    const norm = cleanKey(k);
    const orig = String(k).replace(/[\r\n]+/g, ' ').trim();
    if (
      norm.includes('machinename') || 
      norm.includes('اسمماكينة') || 
      norm.includes('اسم_الماكينة') || 
      norm.includes('اسم-الماكينة') || 
      /^(machine\s*\(?name\)?|اسم\s*الماكينة)$/i.test(orig) ||
      (norm === 'machine' && !norm.includes('id'))
    ) {
      mapping.machine = k;
      break;
    }
  }

  for (const k of keys) {
    const norm = cleanKey(k);
    const orig = String(k).replace(/[\r\n]+/g, ' ').trim();

    // 1. Total Weight: TotalWeight, Total Weight
    if (!mapping.totalWeight && (
      norm === 'totalweight' || 
      norm === 'totalwt' || 
      norm.includes('\u0625\u062c\u0645\u0627\u0644\u064a\u0627\u0644\u0648\u0632\u0646') || 
      norm.includes('\u0627\u062c\u0645\u0627\u0644\u064a\u0627\u0644\u0648\u0632\u0646') || 
      /^(total\s*weight|totalweight|total\s*wt|[\u0625\u0627]\u062c\u0645\u0627\u0644\u064a\s*\u0627\u0644\u0648\u0632\u0646)$/i.test(orig)
    )) {
      mapping.totalWeight = k;
    }

    // 2. Date: Doc Date, Date, DocDate
    if (!mapping.date && (
      norm === 'docdate' || 
      norm === 'date' || 
      norm === 'day' || 
      norm.includes('\u062a\u0627\u0631\u064a\u062e') || 
      /^(doc\s*date|date|docdate|\u062a\u0627\u0631\u064a\u062e|day)$/i.test(orig)
    )) {
      mapping.date = k;
    }

    // 3. Item Code: Product Code, Item Code, Code
    if (!mapping.itemCode && (
      norm === 'productcode' || 
      norm === 'itemcode' || 
      norm === 'code' || 
      norm.includes('\u0643\u0648\u062f') || 
      norm.includes('itemcode') || 
      norm.includes('productcode') ||
      /^(product\s*code|item\s*code|productcode|itemcode|code|\u0643\u0648\u062f(\s*\u0627\u0644\u0635\u0646\u0641)?|item_no)$/i.test(orig)
    )) {
      mapping.itemCode = k;
    }

    // 4. Product Description: Product Name, Description, Specs
    if (!mapping.product && (
      norm === 'productname' || 
      norm === 'description' || 
      norm === 'itemdescription' || 
      norm.includes('productname') ||
      norm.includes('description') ||
      norm.includes('\u0627\u0644\u0635\u0646\u0641') || 
      norm.includes('\u0645\u0648\u0627\u0635\u0641\u0627\u062a') || 
      /^(product\s*name|product\s*description|description|productname|\u0627\u0633\u0645\s*\u0627\u0644\u0635\u0646\u0641|\u0628\u064a\u0627\u0646.*|\u0635\u0646\u0641|\u0645\u0646\u062a\u062c)$/i.test(orig)
    )) {
      mapping.product = k;
    }

    // 5. Quantity: Qty, Quantity
    if (!mapping.qty && (
      norm === 'qty' || 
      norm === 'quantity' || 
      norm.includes('\u0643\u0645\u064a\u0629') || 
      norm === 'productionqty' || 
      /^(qty|quantity|\u0627\u0644\u0643\u0645\u064a\u0629|\u0643\u0645\u064a\u0629|production\s*qty(\s*\(fg\))?)$/i.test(orig)
    )) {
      mapping.qty = k;
    }

    // 6. Unit Weight: Weight, Unit Weight (never match TotalWeight)
    if (!mapping.unitWeight && 
        norm !== 'totalweight' && 
        norm !== 'totalwt' && 
        !norm.includes('\u0625\u062c\u0645\u0627\u0644\u064a') && 
        !norm.includes('\u0627\u062c\u0645\u0627\u0644\u064a') && (
      norm === 'weight' || 
      norm === 'unitweight' || 
      norm === 'unitwt' || 
      norm.includes('\u0627\u0644\u062d\u0628\u0629') || 
      norm.includes('\u0627\u0644\u0645\u062a\u0631') || 
      /^(weight|unit\s*weight|unit\s*wt|\u0648\u0632\u0646\s*\u0627\u0644\u062d\u0628\u0629|\u0648\u0632\u0646\s*\u0627\u0644\u0645\u062a\u0631)$/i.test(orig)
    )) {
      mapping.unitWeight = k;
    }

    // 7. Machine:
    if (!mapping.machine && (
      norm === 'machine' || 
      norm === 'line' || 
      norm.includes('\u0645\u0627\u0643\u064a\u0646\u0629') || 
      norm.includes('\u062e\u0637') || 
      /^(machine|line|\u062e\u0637|\u0645\u0627\u0643\u064a\u0646\u0629|extruder)$/i.test(orig)
    )) {
      mapping.machine = k;
    }

    // 8. Scrap:
    if (!mapping.scrap && (
      norm.includes('scrap') || 
      norm.includes('rejection') || 
      norm.includes('\u0647\u0627\u0644\u0643') || 
      norm.includes('\u0633\u0643\u0631\u0627\u0628') || 
      /^(scrap|rejection|\u0647\u0627\u0644\u0643|\u0633\u0643\u0631\u0627\u0628|waste)$/i.test(orig)
    )) {
      mapping.scrap = k;
    }

    // 9. Hours:
    if (!mapping.hours && (
      norm === 'operatinghours' || 
      norm === 'runhours' || 
      norm === 'hours' || 
      norm.includes('\u0633\u0627\u0639\u0627\u062a') || 
      /^(operating\s*hours|hours|\u0633\u0627\u0639\u0627\u062a(\s*\u0627\u0644\u062a\u0634\u063a\u064a\u0644)?)$/i.test(orig)
    )) {
      mapping.hours = k;
    }

    // 10. Reason of Stop:
    if (!mapping.reason && (
      norm.includes('reason') || 
      norm.includes('downtime') || 
      norm.includes('stop') || 
      norm.includes('remarks') || 
      norm.includes('سبب') || 
      norm.includes('توقف') || 
      norm.includes('ملاحظات')
    )) {
      mapping.reason = k;
    }

    // 11. Material:
    if (!mapping.material && (
      norm === 'material' || 
      norm === 'rawmaterial' || 
      norm.includes('مادة') || 
      norm.includes('خام') || 
      /^(material|raw\s*material|المادة|الخام)$/i.test(orig)
    )) {
      mapping.material = k;
    }
  }

  return mapping;
}

/**
 * Main Data Cleaning & Validation Function
 * Takes raw rows (from Excel or JSON), applies cleaning rules, returns cleaned rows & audit report
 */
export function cleanPipeProductionData(rawData) {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    return {
      cleanedRows: [],
      auditReport: {
        totalRawRows: 0,
        cleanedRowsCount: 0,
        correctionsCount: 0,
        warningsCount: 0,
        issues: []
      }
    };
  }

  const sampleRow = rawData[0];
  const colMap = matchColumns(sampleRow);

  const cleanedRows = [];
  const issues = [];
  let correctionsCount = 0;
  let warningsCount = 0;

  rawData.forEach((row, index) => {
    const rowNum = index + 2; // typical Excel row index (header is 1)

    // Check if row is completely empty
    const values = Object.values(row).filter(v => v !== null && v !== undefined && v !== '');
    if (values.length === 0) return;

    const rowIssues = [];
    const adjustments = [];

    // 1. Clean Date
    const rawDate = colMap.date ? row[colMap.date] : (row['Date'] || row['date']);
    const date = normalizeDate(rawDate);
    if (!date) {
      rowIssues.push({ type: 'error', field: 'Date', message: 'تاريخ غير صالح أو مفقود' });
      warningsCount++;
    }

    // 2. Item Code
    const rawCode = colMap.itemCode ? row[colMap.itemCode] : (row['Item Code'] || row['itemCode'] || row['Product Code']);
    const itemCode = (rawCode !== undefined && rawCode !== null && String(rawCode).trim() !== '' && String(rawCode).trim() !== '-')
      ? String(rawCode).replace(/^ERP-/i, '').trim()
      : 'N/A';

    // 3. Product Description & Specs
    const rawProduct = colMap.product ? row[colMap.product] : (row['Product Description & Specs'] || row['product'] || row['Product Name']);
    const product = rawProduct ? String(rawProduct).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() : 'Unknown Product';
    const specs = parseProductSpecs(product);

    // Explicit or inferred material standardized to 'uPVC', 'HDPE', 'PPR', or 'CPVC'
    const rawMaterial = colMap.material ? row[colMap.material] : (row['Material'] || row['material']);
    const material = rawMaterial ? standardizeMaterial(rawMaterial, product) : specs.material;
    const { diameter, thickness, size, standard } = specs;

    // 4. Machine
    const rawMachine = colMap.machine ? row[colMap.machine] : (row['Machine'] || row['machine']);
    const machine = canonicalizeMachineName(rawMachine);

    // 5. Production Qty (FG)
    const rawQty = colMap.qty ? row[colMap.qty] : (row['Production Qty (FG)'] || row['qty']);
    const qty = Math.max(0, Math.round(parseNumber(rawQty, 0)));

    // 6. Unit Weight (kg)
    const rawUnitWeight = colMap.unitWeight ? row[colMap.unitWeight] : (row['Unit Weight (kg)'] || row['unitWeight']);
    const unitWeight = Math.max(0, Math.round(parseNumber(rawUnitWeight, 0) * 100) / 100);

    // 7. Total Weight (kg) calculation & verification
    const rawTotalWeight = colMap.totalWeight ? row[colMap.totalWeight] : (row['Total Weight (kg)'] || row['TotalWeight'] || row['totalWeight'] || row['Total Weight']);
    const providedTotalWeight = parseNumber(rawTotalWeight, null);
    const calculatedExpectedWeight = Math.round(qty * unitWeight * 100) / 100;

    let finalTotalWeight = providedTotalWeight;
    if (providedTotalWeight === null || providedTotalWeight === 0) {
      finalTotalWeight = calculatedExpectedWeight;
      if (qty > 0 && unitWeight > 0) {
        adjustments.push(`\u062a\u0645 \u062d\u0633\u0627\u0628 \u0627\u0644\u0648\u0632\u0646 \u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u064b: ${finalTotalWeight} kg`);
        correctionsCount++;
      }
    } else {
      // Check for mathematical discrepancy (allow minor rounding up to 3 kg)
      const diff = Math.abs(providedTotalWeight - calculatedExpectedWeight);
      if (diff > 5 && qty > 0 && unitWeight > 0) {
        rowIssues.push({
          type: 'warning',
          field: 'Total Weight',
          message: `\u0641\u0631\u0642 \u062d\u0633\u0627\u0628\u064a: \u0627\u0644\u0645\u0633\u062c\u0644 ${providedTotalWeight} kg \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0645\u062d\u0633\u0648\u0628 (${qty} \u00d7 ${unitWeight}) = ${calculatedExpectedWeight} kg (\u0641\u0627\u0631\u0642 ${diff.toFixed(1)} kg)`
        });
        warningsCount++;
      }
    }

    // 8. Scrap / Rejection (kg)
    const rawScrap = colMap.scrap ? row[colMap.scrap] : (row['Scrap / Rejection (kg)'] || row['scrap']);
    const scrap = Math.max(0, Math.round(parseNumber(rawScrap, 0) * 100) / 100);

    // Scrap % calculation: Scrap / (Total Weight + Scrap) * 100
    const totalRawMaterial = (finalTotalWeight || 0) + scrap;
    const scrapPercentage = totalRawMaterial > 0 ? (scrap / totalRawMaterial) * 100 : 0;
    if (scrapPercentage > 5) {
      rowIssues.push({
        type: 'warning',
        field: 'Scrap',
        message: `\u0646\u0633\u0628\u0629 \u0647\u0627\u0644\u0643 \u0645\u0631\u062a\u0641\u0639\u0629: ${scrapPercentage.toFixed(1)}% (${scrap} kg)`
      });
      warningsCount++;
    }

    // 9. Operating Hours & Downtime
    const rawHours = colMap.hours ? row[colMap.hours] : (row['Operating Hours'] || row['hours']);
    const operatingHours = parseNumber(rawHours, 24);

    if (operatingHours > 24) {
      rowIssues.push({
        type: 'error',
        field: 'Operating Hours',
        message: `\u0633\u0627\u0639\u0627\u062a \u0627\u0644\u062a\u0634\u063a\u064a\u0644 (${operatingHours}) \u062a\u062a\u062c\u0627\u0648\u0632 24 \u0633\u0627\u0639\u0629 \u0644\u0644\u064a\u0648\u0645 \u0627\u0644\u0648\u0627\u062d\u062f`
      });
      warningsCount++;
    }

    const downtimeHours = Math.max(0, 24 - Math.min(operatingHours, 24));

    // 10. Reason of Stop
    const rawReason = colMap.reason ? row[colMap.reason] : (row['Reason of Stop'] || row['reason']);
    let reasonOfStop = rawReason ? String(rawReason).trim() : '';

    if (downtimeHours > 0 && !reasonOfStop) {
      reasonOfStop = '\u063a\u064a\u0631 \u0645\u062d\u062f\u062f (Unspecified)';
      adjustments.push(`\u064a\u0648\u062c\u062f \u062a\u0648\u0642\u0641 (${downtimeHours} \u0633) \u0628\u062f\u0648\u0646 \u0630\u0643\u0631 \u0627\u0644\u0633\u0628\u0628`);
    }

    // 11. Productivity Rate (kg/hr)
    const lineRateKgPerHour = operatingHours > 0 ? Math.round((finalTotalWeight / operatingHours) * 10) / 10 : 0;

    const cleanedRecord = {
      id: `row-${rowNum}-${Date.now()}-${index}`,
      rowNumber: rowNum,
      date,
      itemCode,
      product,
      material,
      diameter,
      thickness,
      size,
      standard,
      machine,
      qty,
      unitWeight,
      totalWeight: Math.round(finalTotalWeight * 100) / 100,
      scrap,
      scrapPercentage: Math.round(scrapPercentage * 100) / 100,
      operatingHours: Math.min(24, Math.max(0, operatingHours)),
      downtimeHours,
      reasonOfStop,
      lineRateKgPerHour,
      dataSource: row['Data Source / Origin'] || row['Data Source'] || row['dataSource'] || (row['inferredMachine'] ? 'Inferred by Model' : 'Actual Production'),
      hasIssues: rowIssues.length > 0,
      issues: rowIssues,
      adjustments
    };

    cleanedRows.push(cleanedRecord);

    if (rowIssues.length > 0 || adjustments.length > 0) {
      issues.push({
        rowNumber: rowNum,
        item: `${machine} - ${product}`,
        issues: rowIssues,
        adjustments
      });
    }
  });

  // Master machine sizing feasibility and capacity loading efficiency
  cleanedRows.forEach(r => {
    const sizingEval = evaluateMachineSizing(r.machine, r.diameter, r.lineRateKgPerHour);
    r.diameterMm = sizingEval.diameterMm;
    r.profileName = sizingEval.profileName;
    r.nominalCapacity = sizingEval.nominalCapacity;
    r.nominalRangeText = sizingEval.nominalRangeText;
    r.isRangeConstrained = sizingEval.isRangeConstrained;
    r.isWithinRange = sizingEval.isWithinRange;
    r.isPelletizing = sizingEval.isPelletizing || false;
    r.lineEfficiency = sizingEval.lineEfficiency;
    r.sizingStatus = sizingEval.sizingStatus;
    r.sizingBadge = sizingEval.sizingBadge;
    r.sizingNote = sizingEval.sizingNote;
  });

  return {
    cleanedRows,
    auditReport: {
      totalRawRows: rawData.length,
      cleanedRowsCount: cleanedRows.length,
      correctionsCount,
      warningsCount,
      issues
    }
  };
}
