// ==========================================================
// Harmonized Factory Machine Master & Physical Sizing Profiles
// ==========================================================

export const PLANT_NAME = 'PVC PIPE EXTRUSION PLANT';
export const SOP_REF = 'SOP-EXT-PVC-01';
export const DOC_VERSION = '04';
export const DOC_STATUS = 'Standardized';

export const SHIFT1_LABEL = 'Shift 1';
export const SHIFT2_LABEL = 'Shift 2';
export const SHIFT1_SPAN = '06:30 - 18:30';
export const SHIFT2_SPAN = '18:30 - 06:30';

// Unified 9 Factory Production & Pelletizing Lines
export const MACHINES = [
  {
    id: 'L-01',
    profileId: 'KTS-550',
    name: 'KTS 550',
    capacityKgH: 400,
    nominalCapacity: 400,
    detail: '400 kg/h',
    minDiameter: null,
    maxDiameter: null,
    isPelletizingLine: true,
    lineType: 'Pelletizing Line',
    matchKeys: ['KTS 550', 'KTS-550', 'KTS550', 'L-01', 'L01', 'LINE 1', 'LINE-1']
  },
  {
    id: 'L-02',
    profileId: 'KTS-250-TDH',
    name: 'KTS 250 TDH',
    capacityKgH: 200,
    nominalCapacity: 200,
    detail: '200 kg/h',
    minDiameter: 20,
    maxDiameter: 50,
    matchKeys: ['KTS 250 TDH', 'KTS-250 TDH', 'KTS-250TDH', 'KTS 250TDH', 'KTS-250', 'KTS 250', 'L-02', 'L02', 'LINE 2', 'LINE-2']
  },
  {
    id: 'L-03',
    profileId: 'KTS-700',
    name: 'KTS 700',
    capacityKgH: 500,
    nominalCapacity: 500,
    detail: '500 kg/h',
    minDiameter: 110,
    maxDiameter: 400,
    matchKeys: ['KTS 700', 'KTS-700', 'KTS700', 'L-03', 'L03', 'LINE 3', 'LINE-3']
  },
  {
    id: 'L-04',
    profileId: 'KTS-200',
    name: 'KTS 200',
    capacityKgH: 180,
    nominalCapacity: 200,
    detail: '180 kg/h',
    minDiameter: 25,
    maxDiameter: 63,
    matchKeys: ['KTS 200', 'KTS-200', 'KTS200', 'L-04', 'L04', 'LINE 4', 'LINE-4']
  },
  {
    id: 'L-05',
    profileId: 'KTS-350',
    name: 'KTS 350',
    capacityKgH: 290,
    nominalCapacity: 330,
    detail: '290 kg/h',
    minDiameter: 75,
    maxDiameter: 160,
    matchKeys: ['KTS 350', 'KTS-350', 'KTS350', 'L-05', 'L05', 'LINE 5', 'LINE-5']
  },
  {
    id: 'L-06',
    profileId: 'KABRA-90',
    name: 'Kabra 90',
    capacityKgH: 380,
    nominalCapacity: 380,
    detail: '380 kg/h',
    minDiameter: 110,
    maxDiameter: 200,
    matchKeys: ['KABRA-90', 'KABRA 90', 'KABRA90', 'K-90', 'K90', 'Kabra 90 (K-90)', 'KABRA 90 (K-90)', 'L-06', 'L06', 'LINE 6', 'LINE-6']
  },
  {
    id: 'L-07',
    profileId: 'KTS-170',
    name: 'KTS 170',
    capacityKgH: 135,
    nominalCapacity: 150,
    detail: '135 kg/h',
    minDiameter: 20,
    maxDiameter: 75,
    matchKeys: ['KTS 170', 'KTS-170', 'KTS170', 'L-07', 'L07', 'LINE 7', 'LINE-7']
  },
  {
    id: 'L-08',
    profileId: 'KTS-350-TDH',
    name: 'KTS 350 TDH',
    capacityKgH: 300,
    nominalCapacity: 300,
    detail: '300 kg/h',
    minDiameter: 25,
    maxDiameter: 75,
    matchKeys: ['KTS 350 TDH', 'KTS-350 TDH', 'KTS-350TDH', 'KTS 350TDH', 'L-08', 'L08', 'LINE 8', 'LINE-8']
  },
  {
    id: 'L-09',
    profileId: 'BAUSANO',
    name: 'Bausano',
    capacityKgH: 1100,
    nominalCapacity: 1100,
    detail: '1100 kg/h',
    minDiameter: null,
    maxDiameter: null,
    isPelletizingLine: true,
    lineType: 'Pelletizing Line',
    matchKeys: ['BAUSANO', 'BAUSANO 1', 'BAUSANO-1', 'L-09', 'L09', 'LINE 9', 'LINE-9']
  }
];

// Profile mapping compatible with Pipe_Data_Analysis
export const MASTER_MACHINE_PROFILES = MACHINES.map(m => ({
  id: m.profileId,
  lineId: m.id,
  name: m.name,
  matchKeys: m.matchKeys,
  minDiameter: m.minDiameter,
  maxDiameter: m.maxDiameter,
  nominalCapacity: m.nominalCapacity,
  capacityKgH: m.capacityKgH,
  isPelletizingLine: m.isPelletizingLine || false,
  lineType: m.lineType
}));

export const CANONICAL_PIPE_EXTRUDERS = [
  'KTS 250 TDH',
  'KTS 700',
  'KTS 200',
  'KTS 350',
  'Kabra 90',
  'KTS 170',
  'KTS 350 TDH'
];

export function machineLabel(id, masterList = MACHINES) {
  const list = masterList && masterList.length > 0 ? masterList : MACHINES;
  const m = list.find((x) => x.id === id || x.profileId === id || x.name === id);
  return m ? `${m.id || m.lineId || ''} - ${m.name} (${m.capacityKgH ? m.capacityKgH + ' kg/h' : (m.detail || m.nominalCapacity + ' kg/h')})` : id || '';
}

export function normalizeMachineKey(str) {
  if (!str) return '';
  return String(str).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Robust machine matching ignoring case, hyphens, spaces, and punctuation
 */
export function matchMachine(str, dynamicList = MACHINES) {
  if (!str) return null;
  const list = dynamicList && dynamicList.length > 0 ? dynamicList : MACHINES;
  const rawNorm = normalizeMachineKey(str);

  // 1. Direct Line ID match (e.g. "L-01", "L01")
  const idMatch = list.find((m) => normalizeMachineKey(m.id) === rawNorm);
  if (idMatch) return idMatch;

  // 2. Direct Name match
  const nameMatch = list.find((m) => normalizeMachineKey(m.name) === rawNorm);
  if (nameMatch) return nameMatch;

  // 3. Substring match for specific models & TDH variants
  if (rawNorm.includes('KTS250')) return list.find((m) => m.id === 'L-02') || null;
  if (rawNorm.includes('KTS350') && rawNorm.includes('TDH')) return list.find((m) => m.id === 'L-08') || null;
  if (rawNorm.includes('KTS350')) return list.find((m) => m.id === 'L-05') || null;
  if (rawNorm.includes('KTS550')) return list.find((m) => m.id === 'L-01') || null;
  if (rawNorm.includes('KTS700')) return list.find((m) => m.id === 'L-03') || null;
  if (rawNorm.includes('KTS200')) return list.find((m) => m.id === 'L-04') || null;
  if (rawNorm.includes('KABRA') || rawNorm.includes('K90')) return list.find((m) => m.id === 'L-06') || null;
  if (rawNorm.includes('KTS170')) return list.find((m) => m.id === 'L-07') || null;
  if (rawNorm.includes('BAUSANO')) return list.find((m) => m.id === 'L-09') || null;

  // 4. Prefix match e.g. "LINE 1", "L-1", "L1"
  const mMatch = rawNorm.match(/^L(?:INE)?0?(\d)$/);
  if (mMatch) {
    const targetId = `L-0${mMatch[1]}`;
    const found = list.find((m) => m.id === targetId);
    if (found) return found;
  }

  return null;
}

export function findMasterMachineProfile(rawName) {
  if (!rawName || typeof rawName !== 'string') return null;
  const clean = rawName.trim().toUpperCase().replace(/[\s_-]+/g, ' ');

  if (clean.includes('350') && clean.includes('TDH')) {
    return MASTER_MACHINE_PROFILES.find(p => p.id === 'KTS-350-TDH');
  }
  if (clean.includes('250')) {
    return MASTER_MACHINE_PROFILES.find(p => p.id === 'KTS-250-TDH');
  }
  if (clean.includes('700')) {
    return MASTER_MACHINE_PROFILES.find(p => p.id === 'KTS-700');
  }
  if (clean.includes('550')) {
    return MASTER_MACHINE_PROFILES.find(p => p.id === 'KTS-550');
  }
  if (clean.includes('350')) {
    return MASTER_MACHINE_PROFILES.find(p => p.id === 'KTS-350');
  }
  if (clean.includes('200')) {
    return MASTER_MACHINE_PROFILES.find(p => p.id === 'KTS-200');
  }
  if (clean.includes('170')) {
    return MASTER_MACHINE_PROFILES.find(p => p.id === 'KTS-170');
  }
  if (clean.includes('KABRA') || clean.includes('K 90') || clean.includes('K-90') || clean.includes('K90') || clean === '90') {
    return MASTER_MACHINE_PROFILES.find(p => p.id === 'KABRA-90');
  }
  if (clean.includes('BAUSANO')) {
    return MASTER_MACHINE_PROFILES.find(p => p.id === 'BAUSANO');
  }

  for (const profile of MASTER_MACHINE_PROFILES) {
    for (const key of profile.matchKeys) {
      if (clean === key.toUpperCase().replace(/[\s_-]+/g, ' ')) {
        return profile;
      }
    }
  }

  return null;
}

export function canonicalizeMachineName(rawName) {
  if (!rawName || typeof rawName !== 'string') return 'UNKNOWN-LINE';
  const clean = rawName.trim();
  if (
    !clean || 
    clean === '-' || 
    clean.toUpperCase() === 'UNKNOWN' || 
    clean.toUpperCase() === 'UNKNOWN-LINE' || 
    clean.toUpperCase() === 'UNKNOWN LINE'
  ) {
    return 'UNKNOWN-LINE';
  }

  const profile = findMasterMachineProfile(clean);
  if (profile) return profile.name;

  return 'UNKNOWN-LINE';
}

export function isUnknownMachine(mach) {
  if (!mach || typeof mach !== 'string') return true;
  const clean = mach.trim().toUpperCase();
  return (
    clean === '' ||
    clean === '-' ||
    clean === 'N/A' ||
    clean === 'UNKNOWN' ||
    clean === 'UNKNOWN-LINE' ||
    clean === 'UNKNOWN LINE' ||
    clean.includes('UNKNOWN')
  );
}

export function isMachineEligibleForDiameter(machineName, diameterMm) {
  if (!machineName || diameterMm === null || diameterMm === undefined) return false;
  const num = typeof diameterMm === 'number' ? diameterMm : parseFloat(diameterMm);
  if (isNaN(num) || num <= 0) return false;

  const profile = findMasterMachineProfile(machineName);
  if (!profile || profile.isPelletizingLine || profile.id === 'BAUSANO' || profile.id === 'KTS-550') {
    return false;
  }

  if (profile.minDiameter !== null && profile.maxDiameter !== null) {
    return num >= profile.minDiameter && num <= profile.maxDiameter;
  }

  return false;
}

export const ASTM_IMPERIAL_OD_MAP = {
  '1/2"': 21.3,
  '1/2': 21.3,
  '3/4"': 26.7,
  '3/4': 26.7,
  '1"': 33.4,
  '1': 33.4,
  '1-1/4"': 42.2,
  '1 1/4"': 42.2,
  '1-1/4': 42.2,
  '1 1/4': 42.2,
  '1.25"': 42.2,
  '1-1/2"': 48.3,
  '1 1/2"': 48.3,
  '1-1/2': 48.3,
  '1 1/2': 48.3,
  '1.5"': 48.3,
  '2"': 60.3,
  '2': 60.3,
  '2-1/2"': 73.0,
  '2 1/2"': 73.0,
  '2-1/2': 73.0,
  '2 1/2': 73.0,
  '2.5"': 73.0,
  '3"': 88.9,
  '3': 88.9,
  '4"': 114.3,
  '4': 114.3,
  '5"': 141.3,
  '5': 141.3,
  '6"': 168.3,
  '6': 168.3,
  '8"': 219.1,
  '8': 219.1,
  '10"': 273.1,
  '10': 273.1,
  '12"': 323.9,
  '12': 323.9
};

export const BLACKLISTED_STANDARD_NUMBERS = ['1785', '2241', '1452', '3587'];

export function parseDiameterToMm(diameterStr) {
  if (!diameterStr || typeof diameterStr !== 'string' || diameterStr === '-') return null;
  const text = diameterStr.trim().toLowerCase();

  for (const num of BLACKLISTED_STANDARD_NUMBERS) {
    if (
      text === num ||
      text === `${num} mm` ||
      text === `${num}mm` ||
      text === `od: ${num} mm` ||
      text === `od ${num} mm` ||
      text.includes(`astm d ${num}`) ||
      text.includes(`astmd ${num}`) ||
      text.includes(`astm d${num}`) ||
      text.includes(`astm ${num}`) ||
      text.includes(`iso ${num}`)
    ) {
      return null;
    }
  }

  const explicitMetricMatch = text.match(/^(\d+(?:\.\d+)?)\s*mm\b/i);
  if (explicitMetricMatch) {
    const val = parseFloat(explicitMetricMatch[1]);
    if (BLACKLISTED_STANDARD_NUMBERS.includes(String(Math.round(val)))) return null;
    return val;
  }

  if (ASTM_IMPERIAL_OD_MAP[text] !== undefined) {
    return ASTM_IMPERIAL_OD_MAP[text];
  }

  const cleanInch = text.replace(/''/g, '"').replace(/\s*inch|\s*in\b/i, '"').trim();
  if (ASTM_IMPERIAL_OD_MAP[cleanInch] !== undefined) {
    return ASTM_IMPERIAL_OD_MAP[cleanInch];
  }

  const normalizedFraction = cleanInch.replace(/(\d+)-(\d+\/\d+)/, '$1 $2');
  if (ASTM_IMPERIAL_OD_MAP[normalizedFraction] !== undefined) {
    return ASTM_IMPERIAL_OD_MAP[normalizedFraction];
  }
  const hyphenatedFraction = cleanInch.replace(/(\d+)\s+(\d+\/\d+)/, '$1-$2');
  if (ASTM_IMPERIAL_OD_MAP[hyphenatedFraction] !== undefined) {
    return ASTM_IMPERIAL_OD_MAP[hyphenatedFraction];
  }

  const inchMatch = text.match(/^(\d+(?:[\s-]+\d+\/\d+|\/\d+)?|\d+(?:\.\d+)?)\s*(?:"|inch|in\b)/);
  if (inchMatch) {
    const raw = inchMatch[1].trim();
    if (BLACKLISTED_STANDARD_NUMBERS.includes(raw)) return null;

    if (ASTM_IMPERIAL_OD_MAP[raw + '"'] !== undefined) return ASTM_IMPERIAL_OD_MAP[raw + '"'];
    if (ASTM_IMPERIAL_OD_MAP[raw] !== undefined) return ASTM_IMPERIAL_OD_MAP[raw];

    if (raw.includes('/')) {
      const parts = raw.split(/[\s-]+/);
      let val = 0;
      if (parts.length === 2) {
        val += parseFloat(parts[0]);
        const [num, den] = parts[1].split('/').map(Number);
        val += num / den;
      } else {
        const [num, den] = parts[0].split('/').map(Number);
        val += num / den;
      }
      return Math.round(val * 25.4 * 10) / 10;
    }
    return Math.round(parseFloat(raw) * 25.4 * 10) / 10;
  }

  const numMatch = text.match(/^(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const val = parseFloat(numMatch[1]);
    if (BLACKLISTED_STANDARD_NUMBERS.includes(String(Math.round(val)))) return null;
    return val;
  }

  return null;
}

export function evaluateMachineSizing(machineName, diameterStr, lineRateKgPerHour) {
  const profile = findMasterMachineProfile(machineName);
  const diameterMm = parseDiameterToMm(diameterStr);
  const rate = Number(lineRateKgPerHour) || 0;

  if (!profile) {
    return {
      profileName: machineName || 'Unknown Extruder',
      nominalCapacity: null,
      nominalRangeText: 'Uncalibrated Line',
      diameterMm,
      isRangeConstrained: false,
      isWithinRange: true,
      lineEfficiency: null,
      sizingStatus: rate >= 150 ? 'Optimal Sizing' : (rate > 0 ? 'Compatible' : 'Zero Output Rate'),
      sizingBadge: rate >= 150 ? 'emerald' : (rate > 0 ? 'blue' : 'slate'),
      sizingNote: 'No calibrated master machine envelope on record'
    };
  }

  const { minDiameter, maxDiameter, nominalCapacity, name, isPelletizingLine } = profile;

  if (isPelletizingLine) {
    return {
      profileName: name,
      nominalCapacity,
      nominalRangeText: 'N/A - Compounding',
      diameterMm,
      isRangeConstrained: false,
      isWithinRange: true,
      isPelletizing: true,
      lineEfficiency: nominalCapacity > 0 ? Math.round((rate / nominalCapacity) * 1000) / 10 : null,
      sizingStatus: 'Pelletizing Line (Exempt)',
      sizingBadge: 'purple',
      sizingNote: 'Pelletizing & compounding line - exempt from pipe diameter sizing evaluations'
    };
  }

  const isRangeConstrained = minDiameter !== null && maxDiameter !== null;
  const nominalRangeText = isRangeConstrained ? `${minDiameter} - ${maxDiameter} mm` : 'Broad / Unconstrained';

  let isWithinRange = true;
  if (isRangeConstrained && diameterMm !== null) {
    if (diameterMm < minDiameter || diameterMm > maxDiameter) {
      isWithinRange = false;
    }
  }

  const lineEfficiency = nominalCapacity > 0 ? Math.round((rate / nominalCapacity) * 1000) / 10 : null;

  if (!isWithinRange) {
    return {
      profileName: name,
      nominalCapacity,
      nominalRangeText,
      diameterMm,
      isRangeConstrained,
      isWithinRange: false,
      lineEfficiency,
      sizingStatus: 'Range Violation',
      sizingBadge: 'rose',
      sizingNote: `Diameter (${diameterMm} mm) violates machine envelope (${nominalRangeText})`
    };
  }

  if (rate <= 0) {
    return {
      profileName: name,
      nominalCapacity,
      nominalRangeText,
      diameterMm,
      isRangeConstrained,
      isWithinRange: true,
      lineEfficiency: 0,
      sizingStatus: 'Zero Output Rate',
      sizingBadge: 'slate',
      sizingNote: 'No continuous operating throughput recorded'
    };
  }

  if (lineEfficiency !== null && lineEfficiency >= 70) {
    return {
      profileName: name,
      nominalCapacity,
      nominalRangeText,
      diameterMm,
      isRangeConstrained,
      isWithinRange: true,
      lineEfficiency,
      sizingStatus: 'Optimal Sizing & Loading',
      sizingBadge: 'emerald',
      sizingNote: `Within allowable range, operating at ${lineEfficiency}% of nominal (${nominalCapacity} kg/h)`
    };
  }

  return {
    profileName: name,
    nominalCapacity,
    nominalRangeText,
    diameterMm,
    isRangeConstrained,
    isWithinRange: true,
    lineEfficiency,
    sizingStatus: 'Suboptimal / Derated',
    sizingBadge: 'amber',
    sizingNote: `Within range but running derated at ${lineEfficiency}% of nominal (${nominalCapacity} kg/h)`
  };
}
