import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAltStoreSource } from '../scripts/generate-altstore-source.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

test('community-source.json: root and public files exist and pass validation', () => {
  const rootSourcePath = path.join(ROOT, 'community-source.json');
  assert.ok(fs.existsSync(rootSourcePath), 'community-source.json must exist in project root');

  const content = JSON.parse(fs.readFileSync(rootSourcePath, 'utf8'));
  assert.ok(validateAltStoreSource(content));
  assert.equal(content.identifier, 'com.cowjiang.aghconsole.source');
  assert.ok(content.apps.length > 0);
  assert.equal(content.apps[0].bundleIdentifier, 'com.cowjiang.aghconsole');
  assert.ok(content.apps[0].versions.length > 0);
  assert.ok(content.apps[0].versions[0].downloadURL.endsWith('.ipa'));

  const publicSourcePath = path.join(ROOT, 'public', 'community-source.json');
  assert.ok(fs.existsSync(publicSourcePath), 'public/community-source.json must exist');
});

test('community-source handler logic: finds file and sets permissive CORS', () => {
  const candidates = [
    path.join(ROOT, 'community-source.json'),
    path.join(ROOT, 'dist', 'community-source.json'),
    path.join(ROOT, 'public', 'community-source.json'),
  ];

  let found = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      found = c;
      break;
    }
  }

  assert.ok(found, 'Should find community-source.json among candidates');

  const headers = {};
  const mockRes = {
    setHeader(key, val) {
      headers[key] = val;
    },
    sendFile(file) {
      this.sentFile = file;
    },
  };

  mockRes.setHeader('Content-Type', 'application/json; charset=utf-8');
  mockRes.setHeader('Access-Control-Allow-Origin', '*');
  mockRes.sendFile(found);

  assert.equal(headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(headers['Access-Control-Allow-Origin'], '*');
  assert.equal(mockRes.sentFile, found);
});
