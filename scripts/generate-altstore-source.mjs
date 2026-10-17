#!/usr/bin/env node
/**
 * Generates and updates `community-source.json` for AltStore and SideStore iOS sideloading.
 *
 * Usage:
 *   node scripts/generate-altstore-source.mjs [options]
 *   node scripts/generate-altstore-source.mjs --self-test
 *
 * Options:
 *   --version <version>       App version (e.g. 0.2.1)
 *   --tag <tag>               Release git tag (default: v<version> or tag)
 *   --date <iso>              Release date (ISO 8601, default: now)
 *   --notes <notes>           Release notes for this version
 *   --notes-file <path>       Path to file containing release notes
 *   --ipa-url <url>           Direct download URL for IPA
 *   --ipa-file <path>         Path to local IPA file to measure size
 *   --size <bytes>            IPA file size in bytes
 *   --min-os <version>        Minimum iOS version (default: 15.0)
 *   --repo <owner/repo>       GitHub repo (default: Cowjiang/adguard-home-console)
 *   --source-url <url>        Canonical source URL
 *   --source-file <path>      Existing source JSON to update (default: community-source.json)
 *   --output <path>           Output file path (default: community-source.json)
 *   --stdout                  Print to stdout instead of writing file
 *   --self-test               Run self-test suite and exit
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const PACKAGE_PATH = path.join(ROOT_DIR, 'package.json');
const TAURI_CONF_PATH = path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json');

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--self-test') {
      options.selfTest = true;
    } else if (arg === '--stdout') {
      options.stdout = true;
    } else if (arg === '--version' && i + 1 < argv.length) {
      options.version = argv[++i];
    } else if (arg === '--tag' && i + 1 < argv.length) {
      options.tag = argv[++i];
    } else if (arg === '--date' && i + 1 < argv.length) {
      options.date = argv[++i];
    } else if (arg === '--notes' && i + 1 < argv.length) {
      options.notes = argv[++i];
    } else if (arg === '--notes-file' && i + 1 < argv.length) {
      options.notesFile = argv[++i];
    } else if (arg === '--ipa-url' && i + 1 < argv.length) {
      options.ipaUrl = argv[++i];
    } else if (arg === '--ipa-file' && i + 1 < argv.length) {
      options.ipaFile = argv[++i];
    } else if (arg === '--size' && i + 1 < argv.length) {
      options.size = Number(argv[++i]);
    } else if (arg === '--min-os' && i + 1 < argv.length) {
      options.minOSVersion = argv[++i];
    } else if (arg === '--repo' && i + 1 < argv.length) {
      options.repo = argv[++i];
    } else if (arg === '--source-url' && i + 1 < argv.length) {
      options.sourceURL = argv[++i];
    } else if (arg === '--source-file' && i + 1 < argv.length) {
      options.sourceFile = argv[++i];
    } else if (arg === '--output' && i + 1 < argv.length) {
      options.output = argv[++i];
    }
  }
  return options;
}

export function validateAltStoreSource(source) {
  if (!source || typeof source !== 'object') {
    throw new Error('Source must be a non-null object');
  }
  if (typeof source.name !== 'string' || !source.name.trim()) {
    throw new Error('Source must contain non-empty string property name');
  }
  if (typeof source.identifier !== 'string' || !source.identifier.trim()) {
    throw new Error('Source must contain non-empty string property identifier');
  }
  if (source.sourceURL && (typeof source.sourceURL !== 'string' || !source.sourceURL.startsWith('https://'))) {
    throw new Error('sourceURL must start with https://');
  }
  if (!Array.isArray(source.apps) || source.apps.length === 0) {
    throw new Error('Source must contain non-empty apps array');
  }

  for (const app of source.apps) {
    if (typeof app.name !== 'string' || !app.name.trim()) {
      throw new Error('App must contain non-empty name');
    }
    if (typeof app.bundleIdentifier !== 'string' || !app.bundleIdentifier.trim()) {
      throw new Error('App must contain non-empty bundleIdentifier');
    }
    if (typeof app.developerName !== 'string' || !app.developerName.trim()) {
      throw new Error('App must contain non-empty developerName');
    }
    if (typeof app.iconURL !== 'string' || !app.iconURL.startsWith('https://')) {
      throw new Error('App must contain valid https:// iconURL');
    }
    if (!Array.isArray(app.versions) || app.versions.length === 0) {
      throw new Error(`App ${app.bundleIdentifier} must contain non-empty versions array`);
    }

    for (const v of app.versions) {
      if (typeof v.version !== 'string' || !SEMVER_RE.test(v.version)) {
        throw new Error(`Invalid version format: ${v.version}`);
      }
      if (typeof v.date !== 'string' || Number.isNaN(Date.parse(v.date))) {
        throw new Error(`Invalid version date: ${v.date}`);
      }
      if (typeof v.downloadURL !== 'string' || !v.downloadURL.startsWith('https://')) {
        throw new Error(`Invalid version downloadURL: ${v.downloadURL}`);
      }
      if (typeof v.size !== 'number' || v.size <= 0) {
        throw new Error(`Invalid version size: ${v.size} (must be positive number)`);
      }
    }
  }

  return true;
}

export function generateAltStoreSource(options = {}) {
  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));
  } catch {
    // fallback
  }

  let tauriConf = {};
  try {
    tauriConf = JSON.parse(readFileSync(TAURI_CONF_PATH, 'utf8'));
  } catch {
    // fallback
  }

  const repo = options.repo || process.env.REPO || process.env.GITHUB_REPOSITORY || 'Cowjiang/adguard-home-console';
  const version = options.version || process.env.VERSION || pkg.version || '0.2.1';
  if (!SEMVER_RE.test(version)) {
    throw new Error(`Version '${version}' is not valid semver`);
  }

  const tag = options.tag || process.env.TAG || `v${version}`;
  const date = options.date || process.env.PUBLISHED_AT || new Date().toISOString();
  const minOSVersion = options.minOSVersion || tauriConf?.bundle?.iOS?.minimumSystemVersion || '15.0';
  const bundleIdentifier = options.bundleIdentifier || tauriConf?.identifier || 'com.cowjiang.aghconsole';
  const appName = options.appName || tauriConf?.productName || 'AGH Console';
  const sourceURL = options.sourceURL || `https://raw.githubusercontent.com/${repo}/main/community-source.json`;
  const defaultIconURL = `https://raw.githubusercontent.com/${repo}/main/src-tauri/icons/icon.png`;

  let notes = options.notes || process.env.NOTES || '';
  const notesFile = options.notesFile || process.env.NOTES_FILE;
  if (!notes && notesFile && existsSync(notesFile)) {
    try {
      notes = readFileSync(notesFile, 'utf8').trim();
    } catch (e) {
      console.warn(`Could not read notes file '${notesFile}': ${e.message}`);
    }
  }

  // Determine size
  let size = options.size || (process.env.IPA_SIZE ? Number(process.env.IPA_SIZE) : 0);
  const ipaFile = options.ipaFile || process.env.IPA_FILE;
  if (!size && ipaFile && existsSync(ipaFile)) {
    try {
      size = statSync(ipaFile).size;
    } catch {
      // ignore
    }
  }
  if (!size || Number.isNaN(size) || size <= 0) {
    // Default estimated IPA size (~15MB) if not measured
    size = 15_485_760;
  }

  const downloadURL = options.ipaUrl || `https://github.com/${repo}/releases/download/${tag}/agh-console.ipa`;

  // Read existing source file if present
  let source = null;
  const sourceFile = options.sourceFile || path.join(ROOT_DIR, 'community-source.json');
  if (existsSync(sourceFile)) {
    try {
      source = JSON.parse(readFileSync(sourceFile, 'utf8'));
    } catch {
      // ignore parse error, create fresh
    }
  }

  if (!source) {
    source = {
      name: 'AGH Console Community Source',
      identifier: 'com.cowjiang.aghconsole.source',
      sourceURL,
      subtitle: 'AdGuard Home Mobile Management Console',
      description: 'Official community distribution source for AGH Console iOS app, compatible with AltStore and SideStore.',
      iconURL: defaultIconURL,
      website: `https://github.com/${repo}`,
      apps: [
        {
          name: appName,
          bundleIdentifier,
          developerName: 'Cowjiang',
          subtitle: 'Mobile console for AdGuard Home',
          localizedDescription: 'A sleek, responsive mobile-first console for AdGuard Home instances with real-time statistics, client management, DNS rewrite rules, and multi-instance sync.',
          iconURL: defaultIconURL,
          tintColor: '10b981',
          category: 'utilities',
          versions: [],
          appPermissions: {
            entitlements: [],
            privacy: {},
          },
        },
      ],
      news: [],
    };
  }

  let app = source.apps.find((a) => a.bundleIdentifier === bundleIdentifier);
  if (!app) {
    app = {
      name: appName,
      bundleIdentifier,
      developerName: 'Cowjiang',
      subtitle: 'Mobile console for AdGuard Home',
      localizedDescription: 'A sleek, responsive mobile-first console for AdGuard Home instances with real-time statistics, client management, DNS rewrite rules, and multi-instance sync.',
      iconURL: defaultIconURL,
      tintColor: '10b981',
      category: 'utilities',
      versions: [],
      appPermissions: {
        entitlements: [],
        privacy: {},
      },
    };
    source.apps.push(app);
  }

  const newVersionEntry = {
    version,
    date,
    downloadURL,
    size,
    minOSVersion,
    localizedDescription: notes || `Release v${version}`,
  };

  // Upsert version: replace if version already exists, or prepend if new
  const existingIdx = app.versions.findIndex((v) => v.version === version);
  if (existingIdx >= 0) {
    app.versions[existingIdx] = newVersionEntry;
  } else {
    app.versions.unshift(newVersionEntry);
  }

  // Keep up to 10 newest versions in manifest
  if (app.versions.length > 10) {
    app.versions = app.versions.slice(0, 10);
  }

  validateAltStoreSource(source);
  return source;
}

export function selfTest() {
  // 1. Fresh generation
  const res = generateAltStoreSource({
    version: '0.2.1',
    tag: 'v0.2.1',
    date: '2026-10-15T16:00:00.000Z',
    notes: 'AltStore support released',
    size: 16000000,
    repo: 'Cowjiang/adguard-home-console',
    sourceFile: '/non-existent-path/source.json',
  });

  assert.equal(res.name, 'AGH Console Community Source');
  assert.equal(res.identifier, 'com.cowjiang.aghconsole.source');
  assert.equal(res.apps.length, 1);
  const app = res.apps[0];
  assert.equal(app.bundleIdentifier, 'com.cowjiang.aghconsole');
  assert.equal(app.versions.length, 1);
  assert.equal(app.versions[0].version, '0.2.1');
  assert.equal(app.versions[0].size, 16000000);
  assert.equal(app.versions[0].downloadURL, 'https://github.com/Cowjiang/adguard-home-console/releases/download/v0.2.1/agh-console.ipa');
  assert.equal(app.versions[0].minOSVersion, '15.0');
  assert.equal(app.versions[0].localizedDescription, 'AltStore support released');

  // 2. Upsert existing version without duplication
  const updated = generateAltStoreSource({
    version: '0.2.1',
    tag: 'v0.2.1',
    date: '2026-10-15T17:00:00.000Z',
    notes: 'Updated notes',
    size: 17000000,
    sourceFile: '/non-existent-path/source.json',
  });
  // Simulate passing updated source
  const nextGen = generateAltStoreSource({
    version: '0.2.2',
    tag: 'v0.2.2',
    date: '2026-10-16T12:00:00.000Z',
    sourceFile: '/non-existent-path/source.json',
  });
  assert.equal(nextGen.apps[0].versions[0].version, '0.2.2');

  // 3. Validation assertions
  assert.throws(() => validateAltStoreSource(null), /non-null object/);
  assert.throws(() => validateAltStoreSource({ name: '' }), /property name/);
  assert.throws(() => validateAltStoreSource({ name: 'A', identifier: '' }), /property identifier/);
  assert.throws(() => validateAltStoreSource({ name: 'A', identifier: 'B', sourceURL: 'http://insecure.com' }), /sourceURL must start with https:\/\//);
  assert.throws(() => validateAltStoreSource({ name: 'A', identifier: 'B', apps: [] }), /non-empty apps array/);

  // 4. Arg parsing
  const parsed = parseArgs(['--version', '1.0.0', '--size', '2048', '--min-os', '16.0']);
  assert.equal(parsed.version, '1.0.0');
  assert.equal(parsed.size, 2048);
  assert.equal(parsed.minOSVersion, '16.0');

  console.log('generate-altstore-source: self-test ok (fresh generation, upsert, schema validation, arg parsing)');
}

const isMain = process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1].endsWith('generate-altstore-source.mjs')
);

if (isMain) {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    selfTest();
  } else {
    const source = generateAltStoreSource(options);
    const jsonStr = JSON.stringify(source, null, 2) + '\n';
    if (options.stdout) {
      process.stdout.write(jsonStr);
    } else {
      const outputPath = options.output || process.env.OUTPUT || 'community-source.json';
      writeFileSync(outputPath, jsonStr, 'utf8');
      console.log(`Generated AltStore/SideStore source written to ${outputPath} (version ${source.apps[0]?.versions[0]?.version})`);
    }
  }
}
