import assert from 'node:assert/strict';
import {
  MACHINE_CAPACITIES_OVERRIDE_KEY,
  getMachineCapacitiesOverrides,
  saveMachineCapacitiesOverrides,
  resolveCanonicalLineId,
  getMachineNominalCapacity,
  setMachineNominalCapacity,
  resetMachineNominalCapacities,
  getAllMachineCapacities
} from '../../src/logic/machineSettingsConfig.js';
import { MACHINES, sanitizeMachineMaster } from '../../src/config/machines.js';
import { buildMorningSopModel } from '../../src/logic/legacySopHelper.js';

console.log('--- Starting Machine Master Settings Configuration Unit Tests ---');

// Mock localStorage for Node.js test environment
const mockStorageMap = new Map();
const mockLocalStorage = {
  getItem: (k) => (mockStorageMap.has(k) ? mockStorageMap.get(k) : null),
  setItem: (k, v) => mockStorageMap.set(k, String(v)),
  removeItem: (k) => mockStorageMap.delete(k),
  clear: () => mockStorageMap.clear(),
  get length() { return mockStorageMap.size; },
  key: (i) => Array.from(mockStorageMap.keys())[i] ?? null
};

globalThis.localStorage = mockLocalStorage;

// Test 1: Empty initial storage returns default catalog presets
mockLocalStorage.clear();
assert.deepEqual(getMachineCapacitiesOverrides(), {}, 'Initial overrides should be empty');

const defaultL02 = getMachineNominalCapacity('L-02');
assert.ok(defaultL02 > 0, 'L-02 default nominal capacity should be positive');
const defaultL08 = getMachineNominalCapacity('L-08');
assert.equal(defaultL08, 400, 'L-08 (KTS 550) default nominal capacity should be 400 kg/h');
const defaultL09 = getMachineNominalCapacity('L-09');
assert.equal(defaultL09, 1100, 'L-09 (Bausano) default nominal capacity should be 1100 kg/h');
console.log('Test 1 Passed: Empty storage returns default catalog presets');

// Test 2: Uploaded dynamic Machine_Master overrides default catalog presets
const mockUploadedMaster = [
  { id: 'L-02', name: 'KTS 170', nominalCapacity: 280 },
  { id: 'L-08', name: 'KTS 550', nominalCapacity: 500 }
];

const uploadedL02 = getMachineNominalCapacity('L-02', mockUploadedMaster);
assert.equal(uploadedL02, 280, 'Uploaded master should take precedence over default preset (280 kg/h)');

const uploadedL08 = getMachineNominalCapacity('L-08', mockUploadedMaster);
assert.equal(uploadedL08, 500, 'Uploaded master should take precedence over default preset (500 kg/h)');

const uploadedL01 = getMachineNominalCapacity('L-01', mockUploadedMaster);
const defaultL01 = getMachineNominalCapacity('L-01');
assert.equal(uploadedL01, defaultL01, 'Unmodified line in uploaded master falls back to catalog preset');
console.log('Test 2 Passed: Dynamic uploaded master overrides catalog presets');

// Test 3: User-configured override in localStorage overrides both uploaded master and presets
setMachineNominalCapacity('L-02', 320);
const overriddenL02 = getMachineNominalCapacity('L-02', mockUploadedMaster);
assert.equal(overriddenL02, 320, 'Configured override (320) must strictly override uploaded master (280)');

setMachineNominalCapacity('KTS 550', 650);
const overriddenL08 = getMachineNominalCapacity('L-08', mockUploadedMaster);
assert.equal(overriddenL08, 650, 'Setting by machine name (KTS 550) must resolve to L-08 and set 650 kg/h');

// Verify stored overrides map
const storedOverrides = getMachineCapacitiesOverrides();
assert.equal(storedOverrides['L-02'], 320);
assert.equal(storedOverrides['L-08'], 650);
console.log('Test 3 Passed: User configured override strictly overrides uploaded values and presets');

// Test 4: Canonical Line ID resolution
assert.equal(resolveCanonicalLineId('L-02'), 'L-02');
assert.equal(resolveCanonicalLineId('L-08'), 'L-08');
assert.equal(resolveCanonicalLineId('KTS 550'), 'L-08');
assert.equal(resolveCanonicalLineId('KTS 350 TDH'), 'L-01');
assert.equal(resolveCanonicalLineId({ id: 'L-04', name: 'KTS 350' }), 'L-04');
console.log('Test 4 Passed: Canonical line ID resolution handles names, IDs, and objects');

// Test 5: Selective and full resets
resetMachineNominalCapacities('L-02');
const afterResetL02 = getMachineNominalCapacity('L-02', mockUploadedMaster);
assert.equal(afterResetL02, 280, 'Resetting L-02 should restore uploaded master value (280)');
assert.equal(getMachineNominalCapacity('L-08', mockUploadedMaster), 650, 'L-08 should still have its override (650)');

resetMachineNominalCapacities(null);
assert.deepEqual(getMachineCapacitiesOverrides(), {}, 'Resetting all should clear all overrides');
assert.equal(getMachineNominalCapacity('L-08', mockUploadedMaster), 500, 'L-08 should restore uploaded master value (500)');
assert.equal(getMachineNominalCapacity('L-08'), 400, 'L-08 without uploaded master should restore default preset (400)');
console.log('Test 5 Passed: Selective and full resets work as expected');

// Test 6: getAllMachineCapacities returns status objects across all canonical lines
setMachineNominalCapacity('L-01', 450);
const allCapacities = getAllMachineCapacities(mockUploadedMaster);
assert.ok(Array.isArray(allCapacities), 'Should return an array');
assert.ok(allCapacities.length >= 8, 'Should include all active factory lines');

const line01 = allCapacities.find((m) => m.id === 'L-01');
assert.ok(line01, 'L-01 must be present');
assert.equal(line01.nominalCapacity, 450);
assert.equal(line01.isOverridden, true);
assert.equal(line01.overrideCapacity, 450);

const line02 = allCapacities.find((m) => m.id === 'L-02');
assert.ok(line02, 'L-02 must be present');
assert.equal(line02.uploadedCapacity, 280);
assert.equal(line02.defaultCapacity, 280);
assert.equal(line02.isOverridden, false);
assert.equal(line02.nominalCapacity, 280);
console.log('Test 6 Passed: getAllMachineCapacities reports comprehensive status');

// Test 7: Integration with sanitizeMachineMaster
const sanitized = sanitizeMachineMaster(mockUploadedMaster);
const sanitizedL01 = sanitized.find((m) => m.id === 'L-01');
assert.equal(sanitizedL01.capacityKgH, 450, 'sanitizeMachineMaster must honor configured override');

// Test 8: Integration with Morning Blank SOP Model
const testLineConfig = {
  lineId: 'L-01',
  itemCode: '255',
  targetRate: 40,
  stdWeight: 3.8,
  speed: 4.0,
  cutLength: 6.0
};

const sopModel = buildMorningSopModel(testLineConfig, { lineMaster: sanitized });
assert.equal(sopModel.nominalCapacityKgH, 450, 'Morning SOP model must honor configured nominal capacity');
assert.equal(sopModel.nominalCapacity, 450, 'Morning SOP model must honor configured nominal capacity');
console.log('Test 8 Passed: Morning Blank SOP Model honors configured nominal capacity');

// Clean up mock storage after tests
resetMachineNominalCapacities();
console.log('--- All Machine Master Settings Configuration Unit Tests Passed (8/8) ---');
