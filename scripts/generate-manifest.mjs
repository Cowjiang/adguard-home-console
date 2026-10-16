#!/usr/bin/env node
/**
 * Generates `version.json` release manifest for AdGuard Home Console.
 *
 * Usage:
 *   node scripts/generate-manifest.mjs [options]
 *   node scripts/generate-manifest.mjs --self-test
 *
 * Options:
 *   --version <version>     Application version (e.g. 0.2.1, or 0.2.1-nightly...)
 *   --channel <channel>     Release channel: 'stable' or 'nightly'
 *   --tag <tag>             Release git tag (e.g. v0.2.1 or nightly)
 *   --notes <notes>         Release notes string
 *   --notes-file <path>     Path to file containing release notes
 *   --published-at <iso>    Published timestamp (ISO 8601)
 *   --repo <owner/repo>     GitHub repository (default: Cowjiang/adguard-home-console)
 *   --image <image>         Docker image reference (default: ghcr.io/<owner>/agh-console:<tag>)
 *   --output <path>         Output JSON file path (default: version.json)
 *   --stdout                Print JSON to stdout instead of writing to file
 *   --self-test             Run self-tests and exit
 *
 * Environment variables:
 *   VERSION, CHANNEL, TAG, NOTES, NOTES_FILE, PUBLISHED_AT, REPO, GITHUB_REPOSITORY, OUTPUT
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_PATH = path.join(__dirname, '..', 'package.json');
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
    } else if (arg === '--channel' && i + 1 < argv.length) {
      options.channel = argv[++i];
    } else if (arg === '--tag' && i + 1 < argv.length) {
      options.tag = argv[++i];
    } else if (arg === '--notes' && i + 1 < argv.length) {
      options.notes = argv[++i];
    } else if (arg === '--notes-file' && i + 1 < argv.length) {
      options.notesFile = argv[++i];
    } else if (arg === '--published-at' && i + 1 < argv.length) {
      options.publishedAt = argv[++i];
    } else if (arg === '--repo' && i + 1 < argv.length) {
      options.repo = argv[++i];
    } else if (arg === '--image' && i + 1 < argv.length) {
      options.image = argv[++i];
    } else if (arg === '--output' && i + 1 < argv.length) {
      options.output = argv[++i];
    }
  }
  return options;
}

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Manifest must be a non-null object');
  }
  if (manifest.schemaVersion !== '1.0') {
    throw new Error(`Invalid schemaVersion '${manifest.schemaVersion}': must be '1.0'`);
  }
  if (typeof manifest.appName !== 'string' || !manifest.appName) {
    throw new Error('appName must be a non-empty string');
  }
  if (manifest.channel !== 'stable' && manifest.channel !== 'nightly') {
    throw new Error(`Invalid channel '${manifest.channel}': must be 'stable' or 'nightly'`);
  }
  if (typeof manifest.version !== 'string' || !SEMVER_RE.test(manifest.version)) {
    throw new Error(`Invalid version '${manifest.version}': must match semver format`);
  }
  if (typeof manifest.releaseTag !== 'string' || !manifest.releaseTag) {
    throw new Error('releaseTag must be a non-empty string');
  }
  if (typeof manifest.publishedAt !== 'string' || Number.isNaN(Date.parse(manifest.publishedAt))) {
    throw new Error(`Invalid publishedAt '${manifest.publishedAt}': must be valid ISO 8601 timestamp`);
  }
  if (typeof manifest.releaseNotes !== 'string') {
    throw new Error('releaseNotes must be a string');
  }
  if (typeof manifest.htmlUrl !== 'string' || !manifest.htmlUrl.startsWith('https://')) {
    throw new Error(`Invalid htmlUrl '${manifest.htmlUrl}': must start with https://`);
  }
  if (!manifest.downloads || typeof manifest.downloads !== 'object') {
    throw new Error('downloads must be an object');
  }
  const { tarball, ipa, docker, npm, altstoreSource } = manifest.downloads;
  if (typeof tarball !== 'string' || !tarball.startsWith('https://')) {
    throw new Error(`Invalid downloads.tarball '${tarball}'`);
  }
  if (typeof ipa !== 'string' || !ipa.startsWith('https://')) {
    throw new Error(`Invalid downloads.ipa '${ipa}'`);
  }
  if (typeof docker !== 'string' || !docker) {
    throw new Error(`Invalid downloads.docker '${docker}'`);
  }
  if (typeof npm !== 'string' || !npm) {
    throw new Error(`Invalid downloads.npm '${npm}'`);
  }
  if (altstoreSource && (typeof altstoreSource !== 'string' || !altstoreSource.startsWith('https://'))) {
    throw new Error(`Invalid downloads.altstoreSource '${altstoreSource}'`);
  }
  return true;
}

export function generateManifest(options = {}) {
  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));
  } catch {
    // If running in an environment without package.json, fallback gracefully
  }

  const appName = options.appName || process.env.APP_NAME || pkg.name || 'agh-console';
  const version = options.version || process.env.VERSION || pkg.version || '0.0.0';
  if (!SEMVER_RE.test(version)) {
    throw new Error(`Version '${version}' is not valid semver`);
  }

  const isNightly = version.includes('-nightly') || options.channel === 'nightly' || process.env.CHANNEL === 'nightly';
  const channel = options.channel || process.env.CHANNEL || (isNightly ? 'nightly' : 'stable');
  if (channel !== 'stable' && channel !== 'nightly') {
    throw new Error(`Channel must be 'stable' or 'nightly', got '${channel}'`);
  }

  const releaseTag = options.tag || process.env.TAG || (channel === 'nightly' ? 'nightly' : `v${version}`);
  const repo = options.repo || process.env.REPO || process.env.GITHUB_REPOSITORY || 'Cowjiang/adguard-home-console';
  const publishedAt = options.publishedAt || process.env.PUBLISHED_AT || new Date().toISOString();

  let releaseNotes = options.notes || process.env.NOTES || '';
  const notesFile = options.notesFile || process.env.NOTES_FILE;
  if (!releaseNotes && notesFile) {
    try {
      releaseNotes = readFileSync(notesFile, 'utf8').trim();
    } catch (err) {
      console.warn(`Could not read notes-file '${notesFile}': ${err.message}`);
    }
  }

  const dockerTag = options.dockerTag || (releaseTag.startsWith('v') ? releaseTag.slice(1) : (channel === 'nightly' ? 'nightly' : version));
  const owner = (repo.split('/')[0] || 'cowjiang').toLowerCase();
  const defaultDocker = `ghcr.io/${owner}/agh-console:${dockerTag}`;

  const manifest = {
    schemaVersion: '1.0',
    appName,
    channel,
    version,
    releaseTag,
    publishedAt,
    releaseNotes,
    htmlUrl: options.htmlUrl || `https://github.com/${repo}/releases/tag/${releaseTag}`,
    downloads: {
      tarball: options.tarball || `https://github.com/${repo}/releases/download/${releaseTag}/agh-console.tar.gz`,
      ipa: options.ipa || `https://github.com/${repo}/releases/download/${releaseTag}/agh-console.ipa`,
      docker: options.docker || options.image || defaultDocker,
      npm: options.npm || `${appName}@${version}`,
      altstoreSource: options.altstoreSource || `https://raw.githubusercontent.com/${repo}/main/community-source.json`,
    },
  };

  validateManifest(manifest);
  return manifest;
}

export function selfTest() {
  // Test stable manifest generation
  const stable = generateManifest({
    version: '0.2.1',
    channel: 'stable',
    tag: 'v0.2.1',
    repo: 'Cowjiang/adguard-home-console',
    publishedAt: '2026-10-15T16:00:00.000Z',
    notes: 'Fixes and enhancements',
  });

  assert.equal(stable.schemaVersion, '1.0');
  assert.equal(stable.appName, 'agh-console');
  assert.equal(stable.channel, 'stable');
  assert.equal(stable.version, '0.2.1');
  assert.equal(stable.releaseTag, 'v0.2.1');
  assert.equal(stable.publishedAt, '2026-10-15T16:00:00.000Z');
  assert.equal(stable.releaseNotes, 'Fixes and enhancements');
  assert.equal(stable.htmlUrl, 'https://github.com/Cowjiang/adguard-home-console/releases/tag/v0.2.1');
  assert.deepEqual(stable.downloads, {
    tarball: 'https://github.com/Cowjiang/adguard-home-console/releases/download/v0.2.1/agh-console.tar.gz',
    ipa: 'https://github.com/Cowjiang/adguard-home-console/releases/download/v0.2.1/agh-console.ipa',
    docker: 'ghcr.io/cowjiang/agh-console:0.2.1',
    npm: 'agh-console@0.2.1',
    altstoreSource: 'https://raw.githubusercontent.com/Cowjiang/adguard-home-console/main/community-source.json',
  });

  // Test nightly manifest generation
  const nightly = generateManifest({
    version: '0.1.0-nightly.20261007.abc1234',
    channel: 'nightly',
    tag: 'nightly',
    repo: 'Cowjiang/adguard-home-console',
    publishedAt: '2026-10-07T19:17:00.000Z',
  });

  assert.equal(nightly.channel, 'nightly');
  assert.equal(nightly.releaseTag, 'nightly');
  assert.equal(nightly.downloads.docker, 'ghcr.io/cowjiang/agh-console:nightly');
  assert.equal(nightly.downloads.npm, 'agh-console@0.1.0-nightly.20261007.abc1234');
  assert.equal(nightly.downloads.altstoreSource, 'https://raw.githubusercontent.com/Cowjiang/adguard-home-console/main/community-source.json');

  // Test argument parser
  const parsed = parseArgs([
    '--version', '1.0.0',
    '--channel', 'stable',
    '--tag', 'v1.0.0',
    '--notes', 'Test notes',
    '--output', 'out.json',
  ]);
  assert.equal(parsed.version, '1.0.0');
  assert.equal(parsed.channel, 'stable');
  assert.equal(parsed.tag, 'v1.0.0');
  assert.equal(parsed.notes, 'Test notes');
  assert.equal(parsed.output, 'out.json');

  // Validation failures
  assert.throws(() => validateManifest(null), /non-null object/);
  assert.throws(() => validateManifest({ ...stable, schemaVersion: '2.0' }), /Invalid schemaVersion/);
  assert.throws(() => validateManifest({ ...stable, channel: 'beta' }), /Invalid channel/);
  assert.throws(() => validateManifest({ ...stable, version: 'invalid' }), /Invalid version/);
  assert.throws(() => validateManifest({ ...stable, publishedAt: 'not-a-date' }), /Invalid publishedAt/);
  assert.throws(() => validateManifest({ ...stable, downloads: null }), /downloads must be an object/);
  assert.throws(() => validateManifest({ ...stable, downloads: { ...stable.downloads, altstoreSource: 'invalid-url' } }), /downloads.altstoreSource/);

  console.log('generate-manifest: self-test ok (stable, nightly, schema validation, arg parsing)');
}

const isMain = process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1].endsWith('generate-manifest.mjs')
);

if (isMain) {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    selfTest();
  } else {
    const manifest = generateManifest(options);
    const jsonStr = JSON.stringify(manifest, null, 2) + '\n';
    if (options.stdout) {
      process.stdout.write(jsonStr);
    } else {
      const outputPath = options.output || process.env.OUTPUT || 'version.json';
      writeFileSync(outputPath, jsonStr, 'utf8');
      console.log(`Generated manifest written to ${outputPath} (${manifest.channel} ${manifest.version})`);
    }
  }
}
