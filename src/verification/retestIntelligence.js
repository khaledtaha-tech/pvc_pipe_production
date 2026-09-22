/**
 * Retest Intelligence & Persistence Engine
 * 
 * Manages persistence of manual scenario checks, operator notes, and detects
 * when capability modifications require re-running previously passed scenarios.
 */

const STORAGE_KEY = "pipe_verification_progress_v1";
const CAP_FINGERPRINTS_KEY = "pipe_verification_cap_fingerprints_v1";

/**
 * Computes a lightweight fingerprint of a capability's definition
 * to detect future modifications.
 */
export function computeCapabilityFingerprint(cap) {
  if (!cap) return "";
  const keyTokens = [
    cap.capabilityId,
    cap.version || "1.0.0",
    (cap.businessRules || []).map(r => r.ruleId).join(','),
    (cap.possibleStates || []).map(s => s.stateId).join(',')
  ];
  return keyTokens.join('|');
}

let inMemoryStorage = {};

function getStorageAdapter() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (key) => inMemoryStorage[key] || null,
    setItem: (key, val) => { inMemoryStorage[key] = String(val); },
    removeItem: (key) => { delete inMemoryStorage[key]; }
  };
}

/**
 * Loads persisted progress from localStorage safely.
 */
export function loadStoredProgress() {
  const storage = getStorageAdapter();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const rawFingerprints = storage.getItem(CAP_FINGERPRINTS_KEY);
    return {
      scenarios: raw ? JSON.parse(raw) : {},
      fingerprints: rawFingerprints ? JSON.parse(rawFingerprints) : {}
    };
  } catch (err) {
    console.warn("Could not load verification progress from storage", err);
    return { scenarios: {}, fingerprints: {} };
  }
}

/**
 * Saves a scenario verification update (status, notes, timestamp).
 */
export function saveScenarioUpdate(scenarioId, updateObj) {
  const storage = getStorageAdapter();
  try {
    const current = loadStoredProgress();
    current.scenarios[scenarioId] = {
      ...(current.scenarios[scenarioId] || {}),
      ...updateObj,
      updatedAt: new Date().toISOString()
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(current.scenarios));
  } catch (err) {
    console.warn("Could not persist scenario update", err);
  }
}

/**
 * Saves current capability fingerprints to track future changes.
 */
export function recordCapabilityFingerprints(capabilities) {
  const storage = getStorageAdapter();
  try {
    const fingerprints = {};
    capabilities.forEach(cap => {
      fingerprints[cap.capabilityId] = computeCapabilityFingerprint(cap);
    });
    storage.setItem(CAP_FINGERPRINTS_KEY, JSON.stringify(fingerprints));
  } catch (err) {
    console.warn("Could not persist capability fingerprints", err);
  }
}

/**
 * Applies Retest Intelligence to a generated plan:
 * 1. Merges saved user statuses and notes.
 * 2. If a capability fingerprint has changed since last pass, marks scenario as RETEST_RECOMMENDED.
 */
export function applyRetestIntelligence(plan) {
  const { scenarios: storedScenarios, fingerprints: storedFingerprints } = loadStoredProgress();
  const currentCapabilities = plan.coverageReport?.covered || [];

  const updatedScenarios = plan.scenarios.map(sc => {
    const stored = storedScenarios[sc.id];
    let status = sc.status;
    let userNotes = "";
    let isRetestRecommended = false;

    if (stored) {
      status = stored.status || sc.status;
      userNotes = stored.notes || "";

      // Check if underlying capability fingerprint changed
      const capId = sc.capabilityId;
      const storedFp = storedFingerprints[capId];
      const cap = currentCapabilities.find(c => c.capabilityId === capId);
      if (cap && storedFp) {
        const currentFp = computeCapabilityFingerprint(cap);
        if (storedFp !== currentFp && status === "PASSED") {
          isRetestRecommended = true;
          status = "RETEST_RECOMMENDED";
        }
      }
    }

    return {
      ...sc,
      status,
      userNotes,
      isRetestRecommended,
      updatedAt: stored?.updatedAt || null
    };
  });

  return {
    ...plan,
    scenarios: updatedScenarios,
    retestRecommendedCount: updatedScenarios.filter(s => s.status === "RETEST_RECOMMENDED").length
  };
}

/**
 * Resets all stored verification progress.
 */
export function clearVerificationProgress() {
  const storage = getStorageAdapter();
  try {
    storage.removeItem(STORAGE_KEY);
    storage.removeItem(CAP_FINGERPRINTS_KEY);
  } catch (err) {
    console.warn("Could not clear verification progress", err);
  }
}
