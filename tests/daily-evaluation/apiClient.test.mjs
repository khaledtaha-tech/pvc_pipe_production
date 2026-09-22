import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  saveReportToApi,
  fetchReportFromApi,
  fetchHistoryFromApi,
  deleteReportFromApi
} from '../../src/logic/apiClient.js';
import { getBenchmarkReport } from '../../src/data/store.js';
import { generateReport } from '../../src/logic/engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

console.log('--- Starting API Client & MySQL Integration Unit Tests ---');

// 1. Verify schema.sql syntax and contents
const schemaPath = path.join(rootDir, 'schema.sql');
assert.ok(fs.existsSync(schemaPath), 'schema.sql file must exist in repository root');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

assert.ok(schemaContent.includes('CREATE TABLE IF NOT EXISTS `daily_reports`'), 'schema.sql must create daily_reports table');
assert.ok(schemaContent.includes('CREATE TABLE IF NOT EXISTS `hourly_records`'), 'schema.sql must create hourly_records table');
assert.ok(schemaContent.includes('UNIQUE KEY `uk_date_line` (`report_date`, `line_machine`)'), 'schema.sql must include unique constraint on (report_date, line_machine)');
assert.ok(schemaContent.includes('REFERENCES `daily_reports` (`id`) ON DELETE CASCADE'), 'schema.sql must include foreign key cascade');
assert.ok(schemaContent.includes('`operating_hours`'), 'schema.sql must include operating_hours KPI column');
assert.ok(schemaContent.includes('`oee_pct`'), 'schema.sql must include oee_pct KPI column');
assert.ok(schemaContent.includes('`raw_json`'), 'schema.sql must include raw_json column for lossless restoration');
console.log('schema.sql structure & foreign keys: OK');

// 2. Verify PHP API endpoint files exist
const apiDir = path.join(rootDir, 'public', 'api');
const requiredApiFiles = [
  'config.php',
  'save_report.php',
  'get_report.php',
  'get_history.php',
  'delete_report.php'
];

for (const file of requiredApiFiles) {
  const filePath = path.join(apiDir, file);
  assert.ok(fs.existsSync(filePath), `Required PHP endpoint public/api/${file} must exist`);
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('<?php'), `${file} must start with <?php`);
}

// Verify config.php contains exact db parameters
const configContent = fs.readFileSync(path.join(apiDir, 'config.php'), 'utf8');
assert.ok(configContent.includes("define('DB_HOST', 'localhost');"), 'config.php must define DB_HOST as localhost');
assert.ok(configContent.includes("define('DB_NAME', 'u976858450_Daily_Records');"), 'config.php must define DB_NAME as u976858450_Daily_Records');
assert.ok(configContent.includes("define('DB_USER', 'u976858450_Daily_Records');"), 'config.php must define DB_USER as u976858450_Daily_Records');
assert.ok(configContent.includes("define('DB_PASS', 'DB_PASSWORD_HERE');"), 'config.php must define DB_PASS with placeholder DB_PASSWORD_HERE');
assert.ok(configContent.includes('utf8mb4'), 'config.php must configure utf8mb4 charset');
console.log('PHP API endpoint files and PDO config: OK');

// 3. Test API client validation
async function testApiClientValidation() {
  const emptyRes = await saveReportToApi(null);
  assert.strictEqual(emptyRes.success, false, 'saveReportToApi should reject null report');

  const invalidRes = await saveReportToApi({});
  assert.strictEqual(invalidRes.success, false, 'saveReportToApi should reject report with missing header');

  const getWithoutParams = await fetchReportFromApi({});
  assert.strictEqual(getWithoutParams.success, false, 'fetchReportFromApi should reject call without id or date+line');

  const deleteWithoutId = await deleteReportFromApi('');
  assert.strictEqual(deleteWithoutId.success, false, 'deleteReportFromApi should reject empty id');

  console.log('API Client input validations: OK');
}

// 4. Test offline resilience and graceful error catching
async function testOfflineResilience() {
  // In Node.js environment without a live PHP server running on relative path,
  // fetch should gracefully catch error and return offline: true without throwing
  const bench = getBenchmarkReport();
  const derived = generateReport(bench);

  const saveRes = await saveReportToApi(bench, derived);
  assert.strictEqual(typeof saveRes, 'object', 'saveReportToApi must return an object');
  assert.strictEqual(saveRes.success, false, 'saveReportToApi should be false when server is not running');
  assert.ok(saveRes.offline || saveRes.message, 'saveReportToApi must report offline/fallback status');

  const fetchRes = await fetchReportFromApi({ id: 1 });
  assert.strictEqual(typeof fetchRes, 'object', 'fetchReportFromApi must return an object');
  assert.strictEqual(fetchRes.success, false, 'fetchReportFromApi should be false when server is not running');
  assert.ok(fetchRes.offline || fetchRes.message, 'fetchReportFromApi must report offline status');

  const histRes = await fetchHistoryFromApi();
  assert.strictEqual(typeof histRes, 'object', 'fetchHistoryFromApi must return an object');
  assert.strictEqual(histRes.success, false, 'fetchHistoryFromApi should be false when server is not running');
  assert.ok(histRes.offline || histRes.message, 'fetchHistoryFromApi must report offline status');

  console.log('API Client offline resilience & error catching: OK');
}

// Execute async tests
(async () => {
  await testApiClientValidation();
  await testOfflineResilience();
  console.log('All API Client & MySQL Integration unit tests passed successfully!');
})();
