// =========================================================================
// Dynamic Capacity & Rate Estimator (Advisory Physical Limits Helper)
// Calculates physical bottlenecks for pipe extrusion based on:
// 1. Extruder Melt Capacity (Weight-based Pcs/h = nominalCap / stdWeight)
// 2. Haul-off / Cooling Constraints (Speed-based Pcs/h = (speed * 60) / length)
// 3. Dynamic Advisory Rate = Math.min(Weight-based, Speed-based)
// =========================================================================

import { getMachinePhysicalSpecs } from './machineSettingsConfig.js';

export const DEFAULT_MAX_LINEAR_SPEED = 4.0; // m/min
export const DEFAULT_PIPE_LENGTH = 6.0;      // meters

/**
 * Calculate dynamic advisory standard production rate based on physical limits.
 *
 * @param {number|object} nominalCapOrOptions - nominal capacity (kg/h) or options object
 * @param {number} [stdWeightArg] - standard unit weight (kg/pc)
 * @param {number} [maxLinearSpeedArg=4.0] - max haul-off/cooling linear speed (m/min)
 * @param {number} [pipeLengthArg=6.0] - pipe length in meters (default 6.0m)
 * @returns {object} Advisory calculation output and dominant bottleneck analysis
 */
export function calculateAdvisoryRate(nominalCapOrOptions, stdWeightArg, maxLinearSpeedArg, pipeLengthArg) {
  let nominalCap = 0;
  let stdWeight = 0;
  let maxLinearSpeed = DEFAULT_MAX_LINEAR_SPEED;
  let pipeLength = DEFAULT_PIPE_LENGTH;

  if (typeof nominalCapOrOptions === 'object' && nominalCapOrOptions !== null) {
    const opts = nominalCapOrOptions;
    nominalCap = Number(opts.nominalCap ?? opts.nominalCapacity ?? opts.capacityKgH) || 0;
    stdWeight = Number(opts.stdWeight ?? opts.unitWeight ?? opts.weightPerPiece) || 0;
    maxLinearSpeed = Number(opts.maxLinearSpeed ?? opts.speed) || DEFAULT_MAX_LINEAR_SPEED;
    pipeLength = Number(opts.pipeLength ?? opts.cutLength) || DEFAULT_PIPE_LENGTH;
  } else {
    nominalCap = Number(nominalCapOrOptions) || 0;
    stdWeight = Number(stdWeightArg) || 0;
    maxLinearSpeed = Number(maxLinearSpeedArg) > 0 ? Number(maxLinearSpeedArg) : DEFAULT_MAX_LINEAR_SPEED;
    pipeLength = Number(pipeLengthArg) > 0 ? Number(pipeLengthArg) : DEFAULT_PIPE_LENGTH;
  }

  if (maxLinearSpeed <= 0) maxLinearSpeed = DEFAULT_MAX_LINEAR_SPEED;
  if (pipeLength <= 0) pipeLength = DEFAULT_PIPE_LENGTH;

  const speedBasedPcsH = pipeLength > 0 ? (maxLinearSpeed * 60) / pipeLength : 0;
  const weightBasedPcsH = (nominalCap > 0 && stdWeight > 0) ? (nominalCap / stdWeight) : null;

  let advisoryRatePcsH = 0;
  let bottleneck = 'unknown';
  let bottleneckLabel = '';
  let bottleneckReason = '';
  let isSpeedLimited = false;
  let isCapacityLimited = false;

  if (weightBasedPcsH != null && weightBasedPcsH > 0 && speedBasedPcsH > 0) {
    if (speedBasedPcsH < weightBasedPcsH) {
      advisoryRatePcsH = speedBasedPcsH;
      bottleneck = 'speed';
      bottleneckLabel = 'Cooling / Speed Limited';
      bottleneckReason = `Cooling / Take-off Speed Limited (based on ${maxLinearSpeed.toFixed(1)} m/min max speed)`;
      isSpeedLimited = true;
    } else {
      advisoryRatePcsH = weightBasedPcsH;
      bottleneck = 'capacity';
      bottleneckLabel = 'Extruder Capacity Limited';
      bottleneckReason = `Extruder Output Limited (${Math.round(nominalCap)} kg/h capacity)`;
      isCapacityLimited = true;
    }
  } else if (speedBasedPcsH > 0 && (weightBasedPcsH == null || weightBasedPcsH <= 0)) {
    advisoryRatePcsH = speedBasedPcsH;
    bottleneck = 'speed';
    bottleneckLabel = 'Cooling / Speed Limited';
    bottleneckReason = `Cooling / Take-off Speed Limited (based on ${maxLinearSpeed.toFixed(1)} m/min max speed)`;
    isSpeedLimited = true;
  } else if (weightBasedPcsH != null && weightBasedPcsH > 0) {
    advisoryRatePcsH = weightBasedPcsH;
    bottleneck = 'capacity';
    bottleneckLabel = 'Extruder Capacity Limited';
    bottleneckReason = `Extruder Output Limited (${Math.round(nominalCap)} kg/h capacity)`;
    isCapacityLimited = true;
  }

  // Round advisory rate to 1 decimal place
  const roundedAdvisoryRate = Math.round(advisoryRatePcsH * 10) / 10;
  const roundedWeightBased = weightBasedPcsH != null ? Math.round(weightBasedPcsH * 10) / 10 : null;
  const roundedSpeedBased = Math.round(speedBasedPcsH * 10) / 10;

  return {
    advisoryRatePcsH: roundedAdvisoryRate,
    suggestedRate: Math.round(roundedAdvisoryRate),
    weightBasedPcsH: roundedWeightBased,
    speedBasedPcsH: roundedSpeedBased,
    bottleneck,
    bottleneckLabel,
    bottleneckReason,
    isSpeedLimited,
    isCapacityLimited,
    nominalCap,
    stdWeight,
    maxLinearSpeed,
    pipeLength
  };
}

/**
 * Check if the advisory rate differs noticeably from the assigned target rate.
 *
 * @param {number|string} assignedRate - currently assigned standard rate
 * @param {number|string} advisoryRate - dynamically calculated advisory rate
 * @param {number} [tolerance=0.5] - difference threshold (pcs/h)
 * @returns {boolean}
 */
export function hasAdvisoryRateDifference(assignedRate, advisoryRate, tolerance = 0.5) {
  const numAssigned = Number(assignedRate) || 0;
  const numAdvisory = Number(advisoryRate) || 0;
  if (numAdvisory <= 0) return false;
  if (numAssigned <= 0) return true;
  return Math.abs(numAssigned - numAdvisory) >= tolerance;
}

/**
 * Convenience helper to calculate advisory rate for a line ID using its persisted machine settings.
 *
 * @param {string} lineId
 * @param {number} stdWeight
 * @param {Array} [dynamicMaster]
 * @param {object} [overrides] - optional temporary overrides { pipeLength, maxLinearSpeed, nominalCap }
 * @returns {object}
 */
export function getAdvisoryRateForMachine(lineId, stdWeight, dynamicMaster = null, overrides = {}) {
  const specs = getMachinePhysicalSpecs(lineId, dynamicMaster);
  const maxLinearSpeed = Number(overrides.maxLinearSpeed) > 0 ? Number(overrides.maxLinearSpeed) : specs.maxLinearSpeed;
  const pipeLength = Number(overrides.pipeLength) > 0 ? Number(overrides.pipeLength) : specs.pipeLength;
  const nominalCap = Number(overrides.nominalCap) > 0 ? Number(overrides.nominalCap) : specs.nominalCap;

  return calculateAdvisoryRate({
    nominalCap,
    stdWeight,
    maxLinearSpeed,
    pipeLength
  });
}
