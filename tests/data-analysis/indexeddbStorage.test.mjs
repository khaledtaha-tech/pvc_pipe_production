// Test suite for IndexedDB Storage Module
import assert from 'assert';
import { 
  isIndexedDbSupported, 
  openDatabase, 
  saveAppState, 
  loadAppState, 
  clearAppState 
} from '../../src/utils/indexedDbStorage.js';

console.log('--- 1. Testing Safe Execution in Non-Browser Environment ---');
assert.strictEqual(isIndexedDbSupported(), false, 'Node environment should report false for isIndexedDbSupported');

const resNoEnvSave = await saveAppState({ rawRows: [1, 2, 3] });
assert.strictEqual(resNoEnvSave, false, 'saveAppState should return false safely when no window.indexedDB');

const resNoEnvLoad = await loadAppState();
assert.strictEqual(resNoEnvLoad, null, 'loadAppState should return null safely when no window.indexedDB');

const resNoEnvClear = await clearAppState();
assert.strictEqual(resNoEnvClear, false, 'clearAppState should return false safely when no window.indexedDB');
console.log('PASS: Safe execution without browser window');

console.log('--- 2. Testing In-Memory Mocked IndexedDB Operations ---');
// Mock minimal IndexedDB implementation
class MockObjectStore {
  constructor() {
    this.data = new Map();
  }
  put(value, key) {
    this.data.set(key, value);
    const req = { result: key };
    return req;
  }
  get(key) {
    const val = this.data.get(key);
    const req = { result: val, onsuccess: null };
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
  clear() {
    this.data.clear();
    const req = { result: undefined };
    return req;
  }
}

class MockTransaction {
  constructor(store) {
    this.store = store;
    this.oncomplete = null;
    this.onerror = null;
    setTimeout(() => {
      if (this.oncomplete) this.oncomplete();
    }, 0);
  }
  objectStore() {
    return this.store;
  }
}

class MockIDBDatabase {
  constructor() {
    this.objectStoreNames = {
      contains: () => true
    };
    this.store = new MockObjectStore();
  }
  transaction() {
    return new MockTransaction(this.store);
  }
}

const mockDb = new MockIDBDatabase();

global.window = {
  indexedDB: {
    open: () => {
      const req = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null
      };
      setTimeout(() => {
        if (req.onsuccess) req.onsuccess({ target: { result: mockDb } });
      }, 0);
      return req;
    }
  }
};

assert.strictEqual(isIndexedDbSupported(), true, 'Mocked environment should report true');

// Test saving 7,467 mock production runs
const mock7467Runs = Array.from({ length: 7467 }, (_, i) => ({
  id: i + 1,
  product: `HDPE PIPE 110x5.3mm Run #${i + 1}`,
  weight: 120.5
}));

const mockHistoricalRuns = Array.from({ length: 7408 }, (_, i) => ({
  id: i + 1,
  itemCode: `ERP-${i + 1}`,
  weight: 80.0
}));

const saveResult = await saveAppState({
  rawRows: mock7467Runs,
  historicalRawRows: mockHistoricalRuns,
  currentSheetName: 'Daily Production Log'
});

assert.strictEqual(saveResult, true, 'saveAppState should succeed in mock IndexedDB');
console.log('PASS: Successfully saved 7,467 active runs + 7,408 historical ERP runs into IndexedDB');

// Test loading from mock IndexedDB
const loaded = await loadAppState();
assert.ok(loaded, 'loadAppState should return a state object');
assert.strictEqual(loaded.isInitialized, true, 'isInitialized should be true');
assert.strictEqual(loaded.rawRows.length, 7467, 'Should restore exact 7,467 active runs');
assert.strictEqual(loaded.historicalRawRows.length, 7408, 'Should restore exact 7,408 historical ERP runs');
assert.strictEqual(loaded.currentSheetName, 'Daily Production Log', 'Should restore sheet name');
console.log('PASS: Successfully hydrated 7,467 active + 7,408 historical ERP runs from IndexedDB');

// Test clearing mock IndexedDB
const clearResult = await clearAppState();
assert.strictEqual(clearResult, true, 'clearAppState should succeed');

const loadedAfterClear = await loadAppState();
assert.ok(loadedAfterClear, 'loadAppState should still return object marked as initialized');
assert.strictEqual(loadedAfterClear.rawRows.length, 0, 'rawRows should be empty array after clear');
assert.strictEqual(loadedAfterClear.historicalRawRows.length, 0, 'historicalRawRows should be empty array after clear');
console.log('PASS: Successfully verified Clear All flushes IndexedDB to empty state');

console.log('\nALL INDEXEDDB STORAGE TESTS PASSED SUCCESSFULLY!');
