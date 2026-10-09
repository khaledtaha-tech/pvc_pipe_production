import assert from 'node:assert/strict';
import {
  calculateAdvisoryRate,
  hasAdvisoryRateDifference,
  getAdvisoryRateForMachine,
  DEFAULT_MAX_LINEAR_SPEED,
  DEFAULT_PIPE_LENGTH
} from '../../src/logic/estimationHelper.js';
import {
  getMachinePhysicalSpecs,
  setMachinePhysicalSpecs,
  resetMachinePhysicalSpecs,
  getMachinePhysicalSpecsOverrides,
  saveMachinePhysicalSpecsOverrides,
  getAllMachineCapacities
} from '../../src/logic/machineSettingsConfig.js';
import { MACHINES } from '../../src/config/machines.js';

console.log('--- Starting Dynamic Capacity & Rate Estimator Unit Tests ---');

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

// Reset mock storage before testing
mockLocalStorage.clear();

// =========================================================================
// Test 1: Small/light pipe where Cooling / Haul-off Speed is the Bottleneck
// Small pipe: 1.2 kg/pc on 300 kg/h extruder, maxSpeed 4.0 m/min, 6.0m length
// Melt limit: 300 / 1.2 = 250 pcs/h
// Speed limit: (4.0 * 60) / 6.0 = 40 pcs/h
// Expected: 40 pcs/h, bottleneck = speed
// =========================================================================
{
  const result = calculateAdvisoryRate({
    nominalCap: 300,
    stdWeight: 1.2,
    maxLinearSpeed: 4.0,
    pipeLength: 6.0
  });

  assert.equal(result.advisoryRatePcsH, 40);
  assert.equal(result.suggestedRate, 40);
  assert.equal(result.speedBasedPcsH, 40);
  assert.equal(result.weightBasedPcsH, 250);
  assert.equal(result.bottleneck, 'speed');
  assert.equal(result.bottleneckLabel, 'Cooling / Speed Limited');
  assert.equal(result.isSpeedLimited, true);
  assert.equal(result.isCapacityLimited, false);
  assert.ok(result.bottleneckReason.includes('4.0 m/min max speed'));
  console.log('Test 1 Passed: Small pipe correctly identified as Cooling / Speed Limited (40 pcs/h vs 250 pcs/h melt)');
}

// =========================================================================
// Test 2: Large/heavy pipe where Extruder Melt Capacity is the Bottleneck
// Large pipe: 15.0 kg/pc on 300 kg/h extruder, maxSpeed 4.0 m/min, 6.0m length
// Melt limit: 300 / 15.0 = 20 pcs/h
// Speed limit: (4.0 * 60) / 6.0 = 40 pcs/h
// Expected: 20 pcs/h, bottleneck = capacity
// =========================================================================
{
  const result = calculateAdvisoryRate({
    nominalCap: 300,
    stdWeight: 15.0,
    maxLinearSpeed: 4.0,
    pipeLength: 6.0
  });

  assert.equal(result.advisoryRatePcsH, 20);
  assert.equal(result.suggestedRate, 20);
  assert.equal(result.speedBasedPcsH, 40);
  assert.equal(result.weightBasedPcsH, 20);
  assert.equal(result.bottleneck, 'capacity');
  assert.equal(result.bottleneckLabel, 'Extruder Capacity Limited');
  assert.equal(result.isSpeedLimited, false);
  assert.equal(result.isCapacityLimited, true);
  assert.ok(result.bottleneckReason.includes('300 kg/h capacity'));
  console.log('Test 2 Passed: Large pipe correctly identified as Extruder Capacity Limited (20 pcs/h vs 40 pcs/h speed)');
}

// =========================================================================
// Test 3: Calling convention with positional arguments
// =========================================================================
{
  const result = calculateAdvisoryRate(200, 2.5, 3.5, 6.0);
  // Melt limit: 200 / 2.5 = 80 pcs/h
  // Speed limit: (3.5 * 60) / 6.0 = 35 pcs/h
  assert.equal(result.advisoryRatePcsH, 35);
  assert.equal(result.bottleneck, 'speed');
  assert.equal(result.isSpeedLimited, true);
  console.log('Test 3 Passed: Positional arguments handled equivalently to options object');
}

// =========================================================================
// Test 4: Default fallbacks for missing speed / cut length
// =========================================================================
{
  const result = calculateAdvisoryRate({
    nominalCap: 350,
    stdWeight: 7.0
    // speed and length omitted
  });

  assert.equal(result.maxLinearSpeed, DEFAULT_MAX_LINEAR_SPEED); // 4.0
  assert.equal(result.pipeLength, DEFAULT_PIPE_LENGTH);         // 6.0
  assert.equal(result.speedBasedPcsH, 40);
  assert.equal(result.weightBasedPcsH, 50); // 350 / 7 = 50
  assert.equal(result.advisoryRatePcsH, 40); // Math.min(50, 40) = 40
  console.log('Test 4 Passed: Default speed (4.0 m/min) and length (6.0m) properly applied');
}

// =========================================================================
// Test 5: hasAdvisoryRateDifference detection
// =========================================================================
{
  // No difference
  assert.equal(hasAdvisoryRateDifference(40, 40), false);
  assert.equal(hasAdvisoryRateDifference(40.2, 40, 0.5), false);

  // Noticeable difference
  assert.equal(hasAdvisoryRateDifference(60, 40), true);
  assert.equal(hasAdvisoryRateDifference(20, 25), true);

  // Missing assigned rate
  assert.equal(hasAdvisoryRateDifference(0, 40), true);
  assert.equal(hasAdvisoryRateDifference('', 40), true);

  // Missing advisory rate
  assert.equal(hasAdvisoryRateDifference(40, 0), false);
  console.log('Test 5 Passed: Rate difference detection functions accurately');
}

// =========================================================================
// Test 6: Machine Physical Specs retrieval and override persistence
// =========================================================================
{
  mockLocalStorage.clear();

  // Catalog defaults for L-01
  const l01Specs = getMachinePhysicalSpecs('L-01');
  assert.equal(l01Specs.lineId, 'L-01');
  assert.equal(l01Specs.maxLinearSpeed, 4.0);
  assert.equal(l01Specs.pipeLength, 6.0);
  assert.equal(l01Specs.isSpeedOverridden, false);
  assert.equal(l01Specs.isLengthOverridden, false);

  // Custom physical specs override
  setMachinePhysicalSpecs('L-01', {
    maxLinearSpeed: 5.5,
    pipeLength: 5.8
  });

  const l01Updated = getMachinePhysicalSpecs('L-01');
  assert.equal(l01Updated.maxLinearSpeed, 5.5);
  assert.equal(l01Updated.pipeLength, 5.8);
  assert.equal(l01Updated.isSpeedOverridden, true);
  assert.equal(l01Updated.isLengthOverridden, true);

  // Reset physical specs
  resetMachinePhysicalSpecs('L-01');
  const l01Reset = getMachinePhysicalSpecs('L-01');
  assert.equal(l01Reset.maxLinearSpeed, 4.0);
  assert.equal(l01Reset.pipeLength, 6.0);
  assert.equal(l01Reset.isSpeedOverridden, false);
  console.log('Test 6 Passed: Physical specs override and reset persistence verified');
}

// =========================================================================
// Test 7: getAdvisoryRateForMachine integration
// =========================================================================
{
  mockLocalStorage.clear();

  // Test L-05 with pipe weight 2.0 kg/pc
  // L-05 default capacity = 200 kg/h
  // Weight limit = 200 / 2.0 = 100 pcs/h
  // Speed limit = (4.0 * 60) / 6.0 = 40 pcs/h
  const advL05 = getAdvisoryRateForMachine('L-05', 2.0);
  assert.equal(advL05.nominalCap, 200);
  assert.equal(advL05.advisoryRatePcsH, 40);
  assert.equal(advL05.bottleneck, 'speed');

  // Test with heavy pipe 10.0 kg/pc on L-05
  // Weight limit = 200 / 10.0 = 20 pcs/h
  // Speed limit = 40 pcs/h
  const advL05Heavy = getAdvisoryRateForMachine('L-05', 10.0);
  assert.equal(advL05Heavy.advisoryRatePcsH, 20);
  assert.equal(advL05Heavy.bottleneck, 'capacity');
  console.log('Test 7 Passed: getAdvisoryRateForMachine correctly combines machine settings and physical limits');
}

console.log('--- ALL Dynamic Capacity & Rate Estimator Unit Tests PASSED Successfully ---');
