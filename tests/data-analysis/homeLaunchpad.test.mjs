import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('--- Starting Executive Command Center (Home Launchpad) Unit Tests ---');

// Test 1: Config Payload Structure & Integrity
console.log('Test 1: Config Payload Structure & Integrity');
const configPath = path.resolve('src/data/launchpadConfig.json');
assert.ok(fs.existsSync(configPath), 'launchpadConfig.json must exist');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
assert.ok(config.title?.en && config.title?.ar, 'Must have bilingual title');
assert.ok(config.subtitle?.en && config.subtitle?.ar, 'Must have bilingual subtitle');
assert.ok(config.quickMetrics, 'Must contain quickMetrics configuration');
assert.ok(Array.isArray(config.pillars), 'pillars must be an array');
assert.strictEqual(config.pillars.length, 3, 'Must contain exactly 3 operational pillars');
console.log('Test 1 Passed: Launchpad config payload structure verified.');

// Test 2: Verification of Three Strategic Operational Pillars (Card Hubs)
console.log('Test 2: Verification of 3 Operational Pillars & Cards');

// Pillar A: Engineering & Governance Hub
const pillarA = config.pillars.find(p => p.id === 'engineering_governance');
assert.ok(pillarA, 'Pillar A (engineering_governance) must exist');
assert.strictEqual(pillarA.cards.length, 3, 'Pillar A must have 3 cards');
const pACards = pillarA.cards.map(c => c.id);
assert.ok(pACards.includes('catalog_harmonizer'), 'Pillar A must include Catalog Harmonizer Lab');
assert.ok(pACards.includes('engineering_docs'), 'Pillar A must include Engineering Governance Hub');
assert.ok(pACards.includes('master_standards_inspector'), 'Pillar A must include Master Standards Inspector');

// Pillar B: Production Operations & OEE
const pillarB = config.pillars.find(p => p.id === 'production_operations');
assert.ok(pillarB, 'Pillar B (production_operations) must exist');
assert.strictEqual(pillarB.cards.length, 3, 'Pillar B must have 3 cards');
const pBCards = pillarB.cards.map(c => c.id);
assert.ok(pBCards.includes('daily_oee_monitoring'), 'Pillar B must include 24h Production Monitoring & OEE');
assert.ok(pBCards.includes('morning_sop_handover'), 'Pillar B must include Morning SOP & Shift Handover');
assert.ok(pBCards.includes('machine_settings_matrix'), 'Pillar B must include Extruder & Machine Matrix');

// Pillar C: Data Integration & Master Ingestion
const pillarC = config.pillars.find(p => p.id === 'data_integration');
assert.ok(pillarC, 'Pillar C (data_integration) must exist');
assert.strictEqual(pillarC.cards.length, 2, 'Pillar C must have 2 cards');
const pCCards = pillarC.cards.map(c => c.id);
assert.ok(pCCards.includes('excel_data_hub'), 'Pillar C must include Excel Data Exchange Hub');
assert.ok(pCCards.includes('plant_analytics_trends'), 'Pillar C must include Plant Analytics & Trends');
console.log('Test 2 Passed: All 3 strategic pillars and 8 operational cards verified.');

// Test 3: Action Triggers and Navigation Targets
console.log('Test 3: Action Triggers and Navigation Targets');
pillarA.cards.forEach(card => {
  assert.ok(card.targetModule, `Card ${card.id} must define targetModule`);
  assert.ok(card.actionEn && card.actionAr, `Card ${card.id} must define bilingual action buttons`);
});

pillarB.cards.forEach(card => {
  assert.ok(card.targetModule || card.triggerAction, `Card ${card.id} must define targetModule or triggerAction`);
  assert.ok(card.actionEn && card.actionAr, `Card ${card.id} must define bilingual action buttons`);
});

pillarC.cards.forEach(card => {
  assert.ok(card.targetModule, `Card ${card.id} must define targetModule`);
  assert.ok(card.actionEn && card.actionAr, `Card ${card.id} must define bilingual action buttons`);
});
console.log('Test 3 Passed: Action triggers and navigation targets verified.');

// Test 4: Default Route in App.jsx is 'launchpad'
console.log('Test 4: Default Route in App.jsx');
const appCode = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
assert.ok(
  appCode.includes("useState('launchpad')"),
  "App.jsx must initialize currentModule to 'launchpad' as default entry point"
);
assert.ok(
  appCode.includes('<HomeLaunchpadView'),
  "App.jsx must render HomeLaunchpadView component when currentModule === 'launchpad'"
);
console.log('Test 4 Passed: Default landing route is set to launchpad.');

// Test 5: Navigation Spine & 1-Click Round Trip Integration
console.log('Test 5: Navigation Spine & 1-Click Round Trip Integration');
const headerCode = fs.readFileSync(path.resolve('src/components/common/Header.jsx'), 'utf8');
assert.ok(headerCode.includes('onNavigateHome'), 'Header.jsx must accept onNavigateHome callback');
assert.ok(headerCode.includes('Home'), 'Header.jsx must import Home icon');
assert.ok(headerCode.includes("case 'launchpad':"), 'Header.jsx must handle launchpad module title');

const sidebarCode = fs.readFileSync(path.resolve('src/components/common/Sidebar.jsx'), 'utf8');
assert.ok(sidebarCode.includes("setCurrentModule('launchpad')"), 'Sidebar.jsx must allow navigating to launchpad');
assert.ok(sidebarCode.includes('<Home'), 'Sidebar.jsx must render Home icon button');
console.log('Test 5 Passed: Navigation spine and 1-click round trip verified in Header and Sidebar.');

// Test 6: Zero Literal Arabic Characters Check
console.log('Test 6: Zero Literal Arabic Characters Check');
const filesToCheck = [
  'src/data/launchpadConfig.json',
  'src/components/home/HomeLaunchpadView.jsx',
  'src/components/common/Header.jsx'
];
const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
filesToCheck.forEach(f => {
  const code = fs.readFileSync(path.resolve(f), 'utf8');
  const match = code.match(arabicRegex);
  assert.strictEqual(match, null, `Literal Arabic character found in ${f}`);
});
console.log('Test 6 Passed: Zero literal Arabic characters in new/updated source files.');

console.log('--- ALL EXECUTIVE COMMAND CENTER UNIT TESTS PASSED (6/6) ---');
