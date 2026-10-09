// =========================================================================
// Machine Master Settings & Nominal Capacity Configuration Helper
// Supports in-app custom overrides for machine nominal output rates (kg/h)
// Fallback hierarchy: User Configured Override > Uploaded Machine_Master > Default Catalog Preset
// =========================================================================

import { MACHINES, matchMachine, normalizeLineId, sanitizeMachineMaster } from '../config/machines.js';

export const MACHINE_CAPACITIES_OVERRIDE_KEY = 'machine_nominal_capacities_override';
export const MACHINE_SPECS_OVERRIDE_KEY = 'machine_physical_specs_override';
export const MACHINE_SETTINGS_CHANGED_EVENT = 'machine-nominal-capacities-changed';

/**
 * Safe accessor for localStorage across browser, Node.js, and mocked environments.
 */
function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

/**
 * Retrieve all custom nominal capacity overrides stored in localStorage.
 * @returns {Record<string, number>} Map of canonical line IDs to custom capacity (kg/h)
 */
export function getMachineCapacitiesOverrides() {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(MACHINE_CAPACITIES_OVERRIDE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const sanitized = {};
      for (const [key, val] of Object.entries(parsed)) {
        const num = Number(val);
        if (!isNaN(num) && num > 0) {
          sanitized[key] = num;
        }
      }
      return sanitized;
    }
  } catch (err) {
    console.error('Failed to parse machine capacities overrides:', err);
  }
  return {};
}

/**
 * Persist capacity overrides to localStorage and emit change notification event.
 * @param {Record<string, number>} overrides
 */
export function saveMachineCapacitiesOverrides(overrides) {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (!overrides || Object.keys(overrides).length === 0) {
      storage.removeItem(MACHINE_CAPACITIES_OVERRIDE_KEY);
    } else {
      storage.setItem(MACHINE_CAPACITIES_OVERRIDE_KEY, JSON.stringify(overrides));
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(MACHINE_SETTINGS_CHANGED_EVENT, {
          detail: { overrides: { ...overrides } }
        })
      );
    }
  } catch (err) {
    console.error('Failed to save machine capacities overrides:', err);
  }
}

/**
 * Resolve the canonical line ID from a machine identifier or name (e.g. "KTS 170" -> "L-02").
 * @param {string|object} machineId
 * @returns {string}
 */
export function resolveCanonicalLineId(machineId) {
  if (!machineId) return '';
  if (typeof machineId === 'object' && machineId !== null) {
    if (machineId.id) return machineId.id;
    if (machineId.lineId) return machineId.lineId;
    if (machineId.name) return normalizeLineId(machineId.name) || machineId.name;
    return '';
  }
  const str = String(machineId).trim();
  const directNorm = normalizeLineId(str);
  if (directNorm) return directNorm;
  const matched = matchMachine(str);
  if (matched && matched.id) return matched.id;
  return str;
}

/**
 * Get the effective nominal capacity (kg/h) for a specific machine.
 * Hierarchy:
 * 1. User configured override (localStorage)
 * 2. Uploaded Machine_Master value
 * 3. Default catalog preset
 *
 * @param {string|object} machineId - Machine ID or model name (e.g. 'L-02', 'KTS 170')
 * @param {Array} [dynamicMaster] - Optional active/uploaded Machine_Master array
 * @returns {number} Nominal capacity in kg/h
 */
export function getMachineNominalCapacity(machineId, dynamicMaster = null) {
  const lineId = resolveCanonicalLineId(machineId);
  if (!lineId) return 0;

  // 1. Configured override
  const overrides = getMachineCapacitiesOverrides();
  if (overrides[lineId] && Number(overrides[lineId]) > 0) {
    return Number(overrides[lineId]);
  }

  // Also check if passed machineId is a name and stored under its name or raw key
  if (typeof machineId === 'string' && overrides[machineId] && Number(overrides[machineId]) > 0) {
    return Number(overrides[machineId]);
  }

  // 2. Uploaded / dynamic Machine_Master value
  if (Array.isArray(dynamicMaster) && dynamicMaster.length > 0) {
    const dynMatch = dynamicMaster.find((m) => {
      if (!m) return false;
      if (m.id === lineId) return true;
      const matched = matchMachine(m.name || m.id, dynamicMaster);
      return matched && matched.id === lineId;
    });

    if (dynMatch) {
      const cap = Number(dynMatch.nominalCapacity || dynMatch.capacityKgH);
      if (!isNaN(cap) && cap > 0) return cap;
    }
  }

  // 3. Default catalog preset
  const canonMatch = MACHINES.find((m) => m.id === lineId);
  if (canonMatch) {
    const cap = Number(canonMatch.nominalCapacity || canonMatch.capacityKgH);
    if (!isNaN(cap) && cap > 0) return cap;
  }

  // Special case for L-09 Bausano
  if (lineId === 'L-09') {
    return 1100;
  }

  return 0;
}

/**
 * Configure and persist custom nominal capacity for a specific machine.
 * @param {string|object} machineId - Machine ID or model name
 * @param {number|string} capacityKgH - New nominal capacity in kg/h
 * @returns {boolean} True if saved successfully
 */
export function setMachineNominalCapacity(machineId, capacityKgH) {
  const lineId = resolveCanonicalLineId(machineId);
  if (!lineId) return false;

  const num = Number(capacityKgH);
  const overrides = getMachineCapacitiesOverrides();

  if (isNaN(num) || num <= 0) {
    delete overrides[lineId];
  } else {
    overrides[lineId] = Math.round(num);
  }

  saveMachineCapacitiesOverrides(overrides);
  return true;
}

/**
 * Reset machine nominal capacity overrides to restore defaults.
 * @param {string|null} [machineId] - If provided, resets only this line. If omitted, resets all lines.
 */
export function resetMachineNominalCapacities(machineId = null) {
  if (machineId) {
    const lineId = resolveCanonicalLineId(machineId);
    if (lineId) {
      const overrides = getMachineCapacitiesOverrides();
      delete overrides[lineId];
      saveMachineCapacitiesOverrides(overrides);
      resetMachinePhysicalSpecs(lineId);
    }
  } else {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(MACHINE_CAPACITIES_OVERRIDE_KEY);
      storage.removeItem(MACHINE_SPECS_OVERRIDE_KEY);
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(MACHINE_SETTINGS_CHANGED_EVENT, {
          detail: { overrides: {}, specsOverrides: {} }
        })
      );
    }
  }
}

/**
 * Retrieve all custom machine physical specs overrides (speed, length) stored in localStorage.
 * @returns {Record<string, object>}
 */
export function getMachinePhysicalSpecsOverrides() {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(MACHINE_SPECS_OVERRIDE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.error('Failed to parse machine physical specs overrides:', err);
  }
  return {};
}

/**
 * Persist machine physical specs overrides to localStorage and dispatch event.
 * @param {Record<string, object>} overrides
 */
export function saveMachinePhysicalSpecsOverrides(overrides) {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (!overrides || Object.keys(overrides).length === 0) {
      storage.removeItem(MACHINE_SPECS_OVERRIDE_KEY);
    } else {
      storage.setItem(MACHINE_SPECS_OVERRIDE_KEY, JSON.stringify(overrides));
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(MACHINE_SETTINGS_CHANGED_EVENT, {
          detail: { specsOverrides: { ...overrides } }
        })
      );
    }
  } catch (err) {
    console.error('Failed to save machine physical specs overrides:', err);
  }
}

/**
 * Retrieve current effective physical specifications and limits for a machine.
 * Hierarchy: User Override > Dynamic Master > Default Catalog Preset (4.0 m/min, 6.0 m)
 *
 * @param {string|object} machineId
 * @param {Array} [dynamicMaster]
 * @returns {object} { lineId, nominalCap, maxLinearSpeed, pipeLength, defaultMaxLinearSpeed, defaultPipeLength, isSpeedOverridden, isLengthOverridden }
 */
export function getMachinePhysicalSpecs(machineId, dynamicMaster = null) {
  const lineId = resolveCanonicalLineId(machineId);
  const nominalCap = getMachineNominalCapacity(machineId, dynamicMaster);
  const canonMatch = MACHINES.find((m) => m.id === lineId);

  let defaultSpeed = canonMatch?.maxLinearSpeed ?? 4.0;
  let defaultLength = canonMatch?.pipeLength ?? 6.0;

  if (Array.isArray(dynamicMaster) && dynamicMaster.length > 0) {
    const dynMatch = dynamicMaster.find((m) => m && m.id === lineId);
    if (dynMatch) {
      if (Number(dynMatch.maxLinearSpeed) > 0) defaultSpeed = Number(dynMatch.maxLinearSpeed);
      if (Number(dynMatch.pipeLength) > 0) defaultLength = Number(dynMatch.pipeLength);
    }
  }

  const specsOverrides = getMachinePhysicalSpecsOverrides();
  const lineOverride = specsOverrides[lineId];

  const maxLinearSpeed = (lineOverride && Number(lineOverride.maxLinearSpeed) > 0)
    ? Number(lineOverride.maxLinearSpeed)
    : defaultSpeed;

  const pipeLength = (lineOverride && Number(lineOverride.pipeLength) > 0)
    ? Number(lineOverride.pipeLength)
    : defaultLength;

  return {
    lineId,
    nominalCap,
    maxLinearSpeed: maxLinearSpeed > 0 ? maxLinearSpeed : 4.0,
    pipeLength: pipeLength > 0 ? pipeLength : 6.0,
    defaultMaxLinearSpeed: defaultSpeed > 0 ? defaultSpeed : 4.0,
    defaultPipeLength: defaultLength > 0 ? defaultLength : 6.0,
    isSpeedOverridden: Boolean(lineOverride && Number(lineOverride.maxLinearSpeed) > 0 && Number(lineOverride.maxLinearSpeed) !== defaultSpeed),
    isLengthOverridden: Boolean(lineOverride && Number(lineOverride.pipeLength) > 0 && Number(lineOverride.pipeLength) !== defaultLength)
  };
}

/**
 * Set physical limits for a machine (max linear speed and pipe length).
 * @param {string|object} machineId
 * @param {object} specs - { maxLinearSpeed, pipeLength, nominalCap }
 * @returns {boolean}
 */
export function setMachinePhysicalSpecs(machineId, specs = {}) {
  const lineId = resolveCanonicalLineId(machineId);
  if (!lineId) return false;

  const overrides = getMachinePhysicalSpecsOverrides();
  const current = overrides[lineId] || {};
  const updated = { ...current };

  if (specs.maxLinearSpeed !== undefined && specs.maxLinearSpeed !== '') {
    const s = Number(specs.maxLinearSpeed);
    if (!isNaN(s) && s > 0) updated.maxLinearSpeed = s;
    else delete updated.maxLinearSpeed;
  }
  if (specs.pipeLength !== undefined && specs.pipeLength !== '') {
    const l = Number(specs.pipeLength);
    if (!isNaN(l) && l > 0) updated.pipeLength = l;
    else delete updated.pipeLength;
  }
  if (specs.nominalCap !== undefined || specs.nominalCapacity !== undefined) {
    const c = Number(specs.nominalCap ?? specs.nominalCapacity);
    if (!isNaN(c) && c > 0) {
      setMachineNominalCapacity(lineId, c);
    }
  }

  if (Object.keys(updated).length === 0) {
    delete overrides[lineId];
  } else {
    overrides[lineId] = updated;
  }

  saveMachinePhysicalSpecsOverrides(overrides);
  return true;
}

/**
 * Reset machine physical limits overrides.
 * @param {string|null} [machineId]
 */
export function resetMachinePhysicalSpecs(machineId = null) {
  if (machineId) {
    const lineId = resolveCanonicalLineId(machineId);
    if (lineId) {
      const overrides = getMachinePhysicalSpecsOverrides();
      delete overrides[lineId];
      saveMachinePhysicalSpecsOverrides(overrides);
    }
  } else {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(MACHINE_SPECS_OVERRIDE_KEY);
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(MACHINE_SETTINGS_CHANGED_EVENT, {
          detail: { specsOverrides: {} }
        })
      );
    }
  }
}

/**
 * Retrieve comprehensive machine capacity status across all factory production lines.
 * Useful for rendering configuration tables and settings modals.
 *
 * @param {Array} [dynamicMaster] - Optional uploaded Machine_Master array
 * @returns {Array<object>} Array of machine line status objects
 */
export function getAllMachineCapacities(dynamicMaster = null) {
  const overrides = getMachineCapacitiesOverrides();
  const canonicalList = sanitizeMachineMaster(dynamicMaster || MACHINES);

  return canonicalList.map((m) => {
    const lineId = m.id;
    const canonPreset = MACHINES.find((c) => c.id === lineId);
    const presetCapacity = canonPreset
      ? Number(canonPreset.nominalCapacity || canonPreset.capacityKgH)
      : (lineId === 'L-09' ? 1100 : 200);

    let uploadedCapacity = null;
    if (Array.isArray(dynamicMaster) && dynamicMaster.length > 0) {
      const dyn = dynamicMaster.find((x) => x && x.id === lineId);
      if (dyn && (Number(dyn.nominalCapacity) > 0 || Number(dyn.capacityKgH) > 0)) {
        uploadedCapacity = Number(dyn.nominalCapacity || dyn.capacityKgH);
      }
    }

    const defaultCapacity = uploadedCapacity != null ? uploadedCapacity : presetCapacity;
    const hasOverride = typeof overrides[lineId] === 'number' && overrides[lineId] > 0;
    const nominalCapacity = hasOverride ? overrides[lineId] : defaultCapacity;

    const specs = getMachinePhysicalSpecs(lineId, dynamicMaster);

    return {
      id: lineId,
      name: m.name || '',
      fullMachineName: `${lineId} - ${m.name}`,
      lineType: m.lineType || 'Pipe Extrusion Line',
      isPelletizingLine: Boolean(m.isPelletizingLine),
      presetCapacity,
      uploadedCapacity,
      defaultCapacity,
      nominalCapacity,
      overrideCapacity: hasOverride ? overrides[lineId] : null,
      isOverridden: hasOverride,
      maxLinearSpeed: specs.maxLinearSpeed,
      defaultMaxLinearSpeed: specs.defaultMaxLinearSpeed,
      pipeLength: specs.pipeLength,
      defaultPipeLength: specs.defaultPipeLength,
      isSpeedOverridden: specs.isSpeedOverridden,
      isLengthOverridden: specs.isLengthOverridden,
      isSpecsOverridden: specs.isSpeedOverridden || specs.isLengthOverridden
    };
  });
}
