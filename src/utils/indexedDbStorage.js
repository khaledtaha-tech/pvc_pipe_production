// IndexedDB Storage Engine for Pipe Production Data Analysis
// Provides persistent client-side storage for large datasets (7,400+ rows)
// Exceeds standard localStorage ~5MB quota without thread blocking.

const DB_NAME = 'PipeDataAnalysisDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const STATE_RECORD_KEY = 'current_dataset';

/**
 * Checks if IndexedDB is supported in the current runtime environment.
 */
export function isIndexedDbSupported() {
  return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
}

/**
 * Opens or upgrades the IndexedDB database.
 */
export function openDatabase() {
  return new Promise((resolve) => {
    if (!isIndexedDbSupported()) {
      resolve(null);
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.warn('IndexedDB open error:', event.target.error);
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB initialization failed:', err);
      resolve(null);
    }
  });
}

/**
 * Saves current application dataset state into IndexedDB atomically.
 * @param {Object} state - { rawRows, historicalRawRows, currentSheetName, isCleared }
 */
export async function saveAppState({ rawRows = [], historicalRawRows = [], currentSheetName = 'Daily Production Log', isCleared = false }) {
  if (!isIndexedDbSupported()) return false;

  const db = await openDatabase();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const payload = {
        rawRows: Array.isArray(rawRows) ? rawRows : [],
        historicalRawRows: Array.isArray(historicalRawRows) ? historicalRawRows : [],
        currentSheetName: currentSheetName || 'Daily Production Log',
        isInitialized: true,
        isCleared: Boolean(isCleared),
        savedAt: Date.now()
      };

      store.put(payload, STATE_RECORD_KEY);

      transaction.oncomplete = () => {
        resolve(true);
      };

      transaction.onerror = (err) => {
        console.warn('Failed to save state to IndexedDB:', err);
        resolve(false);
      };
    } catch (err) {
      console.warn('IndexedDB transaction error during save:', err);
      resolve(false);
    }
  });
}

/**
 * Loads application dataset state from IndexedDB.
 * @returns {Promise<Object|null>}
 */
export async function loadAppState() {
  if (!isIndexedDbSupported()) return null;

  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      const req = store.get(STATE_RECORD_KEY);

      req.onsuccess = () => {
        const result = req.result;
        if (result && result.isInitialized) {
          resolve({
            isInitialized: true,
            isCleared: Boolean(result.isCleared),
            rawRows: Array.isArray(result.rawRows) ? result.rawRows : [],
            historicalRawRows: Array.isArray(result.historicalRawRows) ? result.historicalRawRows : [],
            currentSheetName: result.currentSheetName || 'Daily Production Log',
            savedAt: result.savedAt || null
          });
          return;
        }

        // Fallback check for separate key format
        const reqLegacy = store.get('is_initialized');
        reqLegacy.onsuccess = () => {
          if (reqLegacy.result) {
            const reqActive = store.get('active_production_runs');
            const reqHist = store.get('historical_erp_runs');
            const reqSheet = store.get('current_sheet_name');
            transaction.oncomplete = () => {
              resolve({
                isInitialized: true,
                isCleared: false,
                rawRows: Array.isArray(reqActive.result) ? reqActive.result : [],
                historicalRawRows: Array.isArray(reqHist.result) ? reqHist.result : [],
                currentSheetName: reqSheet.result || 'Daily Production Log',
                savedAt: null
              });
            };
          } else {
            resolve(null);
          }
        };
      };

      transaction.onerror = (err) => {
        console.warn('Failed to load state from IndexedDB:', err);
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB transaction error during load:', err);
      resolve(null);
    }
  });
}

/**
 * Clears all stored dataset state from IndexedDB and marks as blank/cleared.
 */
export async function clearAppState() {
  if (!isIndexedDbSupported()) return false;

  const db = await openDatabase();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();

      const emptyPayload = {
        rawRows: [],
        historicalRawRows: [],
        currentSheetName: 'Daily Production Log',
        isInitialized: true,
        isCleared: true,
        savedAt: Date.now()
      };

      store.put(emptyPayload, STATE_RECORD_KEY);

      transaction.oncomplete = () => {
        resolve(true);
      };

      transaction.onerror = (err) => {
        console.warn('Failed to clear state in IndexedDB:', err);
        resolve(false);
      };
    } catch (err) {
      console.warn('IndexedDB transaction error during clear:', err);
      resolve(false);
    }
  });
}
