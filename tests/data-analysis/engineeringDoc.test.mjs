import assert from 'assert';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

import {
  escapeXml,
  loadEngineeringDoc,
  saveEngineeringDoc,
  resetEngineeringDoc,
  generateDocxBlob,
  ENGINEERING_DOC_STORAGE_KEY
} from '../../src/logic/engineeringDocHelper.js';

console.log('--- Starting Engineering Governance Documentation Unit Tests ---');

// Test 1: Seed JSON Payload Structure & Integrity
console.log('Test 1: Seed JSON Payload Structure & Integrity');
const seedDocPath = path.resolve('src/data/engineeringGovernanceDoc.json');
assert.strictEqual(fs.existsSync(seedDocPath), true, 'Seed JSON file must exist');

const seedRaw = fs.readFileSync(seedDocPath, 'utf8');
const seedDoc = JSON.parse(seedRaw);

assert.ok(seedDoc.title && seedDoc.title.length > 5, 'Title must exist');
assert.ok(seedDoc.subtitle && seedDoc.subtitle.length > 5, 'Subtitle must exist');
assert.strictEqual(Array.isArray(seedDoc.sections), true, 'Sections must be an array');
assert.strictEqual(seedDoc.sections.length, 6, 'Must contain exactly 6 sections');

let totalItems = 0;
seedDoc.sections.forEach((sec, idx) => {
  assert.ok(sec.id, `Section ${idx + 1} must have an id`);
  assert.ok(sec.heading, `Section ${idx + 1} must have a heading`);
  assert.strictEqual(Array.isArray(sec.items), true, `Section ${idx + 1} items must be an array`);
  assert.ok(sec.items.length > 0, `Section ${idx + 1} must have items`);
  sec.items.forEach((item, itemIdx) => {
    assert.strictEqual(typeof item, 'string', `Item ${itemIdx + 1} in section ${idx + 1} must be string`);
    assert.ok(item.trim().length > 0, `Item ${itemIdx + 1} in section ${idx + 1} cannot be empty`);
  });
  totalItems += sec.items.length;
});
assert.strictEqual(totalItems, 23, 'Must contain exactly 23 items across all 6 sections');
console.log('Test 1 Passed: 6 sections and 23 items verified in seed JSON.');

// Test 2: escapeXml Utility
console.log('Test 2: escapeXml Utility');
assert.strictEqual(escapeXml('Hello & <World> "quotes" \'apostrophe\''), 'Hello &amp; &lt;World&gt; &quot;quotes&quot; &apos;apostrophe&apos;');
assert.strictEqual(escapeXml('Clean String 123'), 'Clean String 123');
assert.strictEqual(escapeXml(null), '');
assert.strictEqual(escapeXml(undefined), '');
console.log('Test 2 Passed: XML character escaping verified.');

// Test 3: Document State Operations with LocalStorage Mock
console.log('Test 3: Document State Operations & Persistence');
const mockStorage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
    clear: () => mockStorage.clear()
  }
};

// 3a. Initial load returns default seed
const initialDoc = loadEngineeringDoc();
assert.strictEqual(initialDoc.title, seedDoc.title);
assert.strictEqual(initialDoc.sections.length, 6);

// 3b. Save modified document
const modifiedDoc = JSON.parse(JSON.stringify(initialDoc));
modifiedDoc.title = 'Updated Engineering Title';
modifiedDoc.sections[0].items.push('New governance guideline point');
const saveResult = saveEngineeringDoc(modifiedDoc);
assert.strictEqual(saveResult, true);
assert.ok(mockStorage.has(ENGINEERING_DOC_STORAGE_KEY));

// 3c. Load reflects saved document
const reloadedDoc = loadEngineeringDoc();
assert.strictEqual(reloadedDoc.title, 'Updated Engineering Title');
assert.strictEqual(reloadedDoc.sections[0].items.length, initialDoc.sections[0].items.length + 1);

// 3d. Reset restores to default seed
const resetResult = resetEngineeringDoc();
assert.strictEqual(resetResult.title, seedDoc.title);
assert.strictEqual(resetResult.sections[0].items.length, seedDoc.sections[0].items.length);
assert.strictEqual(mockStorage.has(ENGINEERING_DOC_STORAGE_KEY), false);

// 3e. Safe error handling on invalid doc
assert.throws(() => {
  saveEngineeringDoc({ invalid: true });
}, /Invalid document structure/);

console.log('Test 3 Passed: Document load, save, reset, and validation verified.');

// Test 4: OpenXML Word (.docx) Generation & ZIP Package Validation
console.log('Test 4: OpenXML Word (.docx) Package Generation');
const docxBlob = await generateDocxBlob(seedDoc);
assert.ok(docxBlob, 'Generated blob must exist');

// Read zip content using JSZip
const zip = new JSZip();
let zipData;
if (docxBlob.arrayBuffer) {
  zipData = await docxBlob.arrayBuffer();
} else {
  // If in node environment without native Blob.arrayBuffer
  zipData = docxBlob;
}
const unzipped = await zip.loadAsync(zipData);

assert.ok(unzipped.file('[Content_Types].xml'), 'Must contain [Content_Types].xml');
assert.ok(unzipped.file('_rels/.rels'), 'Must contain _rels/.rels');
assert.ok(unzipped.file('word/document.xml'), 'Must contain word/document.xml');

const documentXml = await unzipped.file('word/document.xml').async('string');
assert.ok(documentXml.includes('<w:pgSz w:w="11906" w:h="16838"/>'), 'Must configure A4 dimensions');
assert.ok(documentXml.includes('<w:bidi/>'), 'Must contain RTL / bidi direction flags');
assert.ok(documentXml.includes(escapeXml(seedDoc.title)), 'Must contain escaped title in document XML');
assert.ok(documentXml.includes(escapeXml(seedDoc.subtitle)), 'Must contain escaped subtitle');
seedDoc.sections.forEach((sec) => {
  assert.ok(documentXml.includes(escapeXml(sec.heading)), `Must contain section heading: ${sec.heading}`);
});
console.log('Test 4 Passed: OpenXML Word (.docx) ZIP structure and A4/RTL tags verified.');

// Test 5: Strict Arabic Character Policy Enforcement
console.log('Test 5: Zero Literal Arabic Characters in Source Files');
const sourceFilesToCheck = [
  'src/components/engineering-docs/EngineeringDocView.jsx',
  'src/logic/engineeringDocHelper.js'
];

const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

sourceFilesToCheck.forEach((relPath) => {
  const fullPath = path.resolve(relPath);
  assert.strictEqual(fs.existsSync(fullPath), true, `File must exist: ${relPath}`);
  const code = fs.readFileSync(fullPath, 'utf8');
  const match = code.match(arabicRegex);
  assert.strictEqual(match, null, `Literal Arabic character found in ${relPath}: ${match ? match[0] : ''}`);
});

console.log('Test 5 Passed: Zero literal Arabic characters in new component & helper source files.');

console.log('--- ALL ENGINEERING GOVERNANCE DOCUMENTATION TESTS PASSED (5/5) ---');
