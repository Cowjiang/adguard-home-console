#!/usr/bin/env node
/**
 * Automated version bump & changelog generator:
 * - Computes next semantic version (auto from conventional commits, or patch/minor/major/custom)
 *   Rule: Major version bumps must be manually specified. Breaking changes, features,
 *   and refactoring automatically bump the minor (middle) version.
 * - Updates package.json, src-tauri/tauri.conf.json, and src-tauri/gen/apple/project.yml
 * - Updates CHANGELOG.md (via git-cliff if available, or built-in conventional parser fallback)
 *
 * Usage:
 *   node .github/scripts/bump-version.mjs [--type auto|patch|minor|major|custom] [--version X.Y.Z] [--dry-run]
 *   node .github/scripts/bump-version.mjs --self-test
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { coreVersion, stampAppleProject } from './release-plan.mjs';

const PACKAGE_URL = new URL('../../package.json', import.meta.url);
const TAURI_CONFIG_URL = new URL('../../src-tauri/tauri.conf.json', import.meta.url);
const APPLE_PROJECT_URL = new URL('../../src-tauri/gen/apple/project.yml', import.meta.url);
const CHANGELOG_URL = new URL('../../CHANGELOG.md', import.meta.url);

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

export function bumpSemver(current, type) {
  const match = SEMVER_RE.exec(current);
  if (!match) throw new Error(`Invalid base version: ${current}`);
  let major = parseInt(match[1], 10);
  let minor = parseInt(match[2], 10);
  let patch = parseInt(match[3], 10);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unknown bump type: ${type}`);
  }
}

/**
 * Automatically infers bump type from commit messages.
 * Rule: Major versions must be manually specified. Breaking changes, architectural
 * refactors, and feature additions all bump the minor (middle) version.
 * Routine fixes, docs, and maintenance bump the patch version.
 */
export function inferBumpTypeFromCommits(commitMessages) {
  for (const msg of commitMessages) {
    if (
      /BREAKING[ -]CHANGE:/i.test(msg) ||
      /^[a-z]+(\([a-z0-9_-]+\))?!:/.test(msg) ||
      /^feat(\([a-z0-9_-]+\))?:/.test(msg) ||
      /^refactor(\([a-z0-9_-]+\))?:/.test(msg)
    ) {
      return 'minor';
    }
  }
  return 'patch';
}

export function isAncestor(tag, target = 'HEAD') {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', tag, target], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function getPreviousTag(target = 'HEAD') {
  try {
    const stdout = execFileSync('git', ['tag', '--list', 'v[0-9]*.[0-9]*.[0-9]*', '--sort=-v:refname'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!stdout) return null;
    const candidates = stdout.split('\n').map((t) => t.trim()).filter(Boolean);
    for (const tag of candidates) {
      if (isAncestor(tag, target)) {
        return tag;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function getCommitsSince(tag) {
  try {
    const range = tag ? `${tag}..HEAD` : 'HEAD';
    const stdout = execFileSync('git', ['log', '--no-merges', '--pretty=%h|%s', range], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!stdout) return [];
    return stdout.split('\n').map((line) => {
      const idx = line.indexOf('|');
      return {
        hash: line.slice(0, idx),
        message: line.slice(idx + 1),
      };
    });
  } catch {
    return [];
  }
}

export function generateChangelogSection(version, dateStr, commits) {
  const groups = {
    'Breaking Changes': [],
    Features: [],
    'Bug Fixes': [],
    Performance: [],
    Refactoring: [],
    Documentation: [],
    Other: [],
  };

  for (const c of commits) {
    const msg = c.message;
    if (/BREAKING[ -]CHANGE:/i.test(msg) || /^[a-z]+(\([a-z0-9_-]+\))?!:/.test(msg)) {
      groups['Breaking Changes'].push(c);
    } else if (/^feat/i.test(msg)) {
      groups.Features.push(c);
    } else if (/^fix/i.test(msg)) {
      groups['Bug Fixes'].push(c);
    } else if (/^perf/i.test(msg)) {
      groups.Performance.push(c);
    } else if (/^refactor/i.test(msg)) {
      groups.Refactoring.push(c);
    } else if (/^docs/i.test(msg)) {
      groups.Documentation.push(c);
    } else if (!/^chore\(release\)/i.test(msg)) {
      groups.Other.push(c);
    }
  }

  let section = `## [${version}] - ${dateStr}\n\n`;
  for (const [title, list] of Object.entries(groups)) {
    if (list.length === 0) continue;
    section += `### ${title}\n\n`;
    for (const item of list) {
      const prefix = title === 'Breaking Changes' ? '[**breaking**] ' : '';
      section += `- ${prefix}${item.message} ([${item.hash}](https://github.com/Cowjiang/adguard-home-console/commit/${item.hash}))\n`;
    }
    section += '\n';
  }
  return section.trimEnd();
}

export function updateChangelogFile(newSection) {
  const header = '# Changelog\n\nAll notable changes to this project will be documented in this file.\nSee [Conventional Commits](https://www.conventionalcommits.org/) for commit guidelines.\n\n';
  let existing = '';
  if (existsSync(CHANGELOG_URL)) {
    existing = readFileSync(CHANGELOG_URL, 'utf8');
    const firstHeader = existing.indexOf('## [');
    existing = firstHeader !== -1 ? existing.slice(firstHeader) : '';
  }
  const content = `${header}${newSection}\n\n${existing}`.trimEnd() + '\n';
  writeFileSync(CHANGELOG_URL, content);
}

function writeNewVersion(version) {
  const pkg = JSON.parse(readFileSync(PACKAGE_URL, 'utf8'));
  pkg.version = version;
  writeFileSync(PACKAGE_URL, `${JSON.stringify(pkg, null, 2)}\n`);

  const tauri = JSON.parse(readFileSync(TAURI_CONFIG_URL, 'utf8'));
  tauri.version = version;
  writeFileSync(TAURI_CONFIG_URL, `${JSON.stringify(tauri, null, 2)}\n`);

  if (existsSync(APPLE_PROJECT_URL)) {
    const project = readFileSync(APPLE_PROJECT_URL, 'utf8');
    const stamped = stampAppleProject(project, version);
    writeFileSync(APPLE_PROJECT_URL, stamped);
  }
}

export function runBump(options = {}) {
  const pkg = JSON.parse(readFileSync(PACKAGE_URL, 'utf8'));
  const currentVersion = pkg.version;
  const prevTag = getPreviousTag();
  const commits = getCommitsSince(prevTag);
  const commitMessages = commits.map((c) => c.message);

  let nextVersion = options.customVersion;
  if (nextVersion) {
    nextVersion = nextVersion.replace(/^v/, '');
    if (!SEMVER_RE.test(nextVersion)) {
      throw new Error(`Custom version '${options.customVersion}' is not a valid SemVer`);
    }
  } else if (options.type === 'custom') {
    throw new Error("Version bump type is 'custom' but no custom version was specified via --version");
  } else {
    const bumpType = options.type === 'auto' || !options.type
      ? inferBumpTypeFromCommits(commitMessages)
      : options.type;
    nextVersion = bumpSemver(currentVersion, bumpType);
  }

  console.log(`Current version: ${currentVersion}`);
  console.log(`Previous tag:    ${prevTag || '(none)'}`);
  console.log(`Unreleased commits: ${commits.length}`);
  console.log(`Target version:  ${nextVersion}`);

  if (options.dryRun) {
    console.log('[dry-run] Skipping file modifications and tag creation.');
    return { currentVersion, nextVersion, prevTag, commitsCount: commits.length };
  }

  // Update project files
  writeNewVersion(nextVersion);
  console.log(`Updated package.json, tauri.conf.json, and Apple project to ${nextVersion}`);

  // Generate changelog
  const today = new Date().toISOString().slice(0, 10);
  let updatedViaCliff = false;
  try {
    execSync(`git-cliff --tag "v${nextVersion}" -o CHANGELOG.md`, { stdio: 'pipe' });
    updatedViaCliff = true;
    console.log('Updated CHANGELOG.md via git-cliff');
  } catch {
    // Fallback to built-in generator
    const section = generateChangelogSection(nextVersion, today, commits);
    updateChangelogFile(section);
    console.log('Updated CHANGELOG.md via built-in conventional generator');
  }

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `new_version=${nextVersion}\nrelease_tag=v${nextVersion}\n`);
  }

  return { currentVersion, nextVersion, prevTag, commitsCount: commits.length, updatedViaCliff };
}

function selfTest() {
  assert.equal(bumpSemver('0.1.0', 'patch'), '0.1.1');
  assert.equal(bumpSemver('0.1.0', 'minor'), '0.2.0');
  assert.equal(bumpSemver('0.1.0', 'major'), '1.0.0');
  assert.equal(bumpSemver('1.2.3', 'patch'), '1.2.4');

  // Rules: major must be manually specified. Breaking changes, features, and refactors all bump minor.
  assert.equal(inferBumpTypeFromCommits(['fix: typo', 'docs: update', 'perf: faster loop']), 'patch');
  assert.equal(inferBumpTypeFromCommits(['feat: new modal', 'fix: bug']), 'minor');
  assert.equal(inferBumpTypeFromCommits(['refactor(core): rewrite proxy engine']), 'minor');
  assert.equal(inferBumpTypeFromCommits(['feat!: breaking change test']), 'minor');
  assert.equal(inferBumpTypeFromCommits(['fix: patch\n\nBREAKING CHANGE: something']), 'minor');

  const testCommits = [
    { hash: 'abc1234', message: 'feat(ui): add dashboard' },
    { hash: 'def5678', message: 'fix(core): resolve null pointer' },
    { hash: 'ghi9012', message: 'feat!: breaking change test' },
  ];
  const section = generateChangelogSection('0.2.0', '2026-10-14', testCommits);
  assert.ok(section.includes('## [0.2.0] - 2026-10-14'));
  assert.ok(section.includes('### Breaking Changes'));
  assert.ok(section.includes('### Features'));
  assert.ok(section.includes('### Bug Fixes'));
  assert.ok(section.includes('feat(ui): add dashboard'));
  assert.ok(section.includes('[**breaking**] feat!: breaking change test'));

  // Custom version validation
  assert.throws(() => runBump({ type: 'custom' }), /no custom version was specified/);
  assert.throws(() => runBump({ customVersion: 'not-semver' }), /not a valid SemVer/);

  console.log('bump-version: self-test ok (SemVer bumps, commit inference, changelog section generation, custom validations)');
}

const args = process.argv.slice(2);
// `file://${process.argv[1]}` only matches where argv[1] is already a POSIX path
// (the CI runner); on Windows it is D:\… and the concatenation never equals
// import.meta.url, so the script used to exit silently there.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (args.includes('--self-test')) {
  selfTest();
} else if (isMain) {
  const typeIndex = args.indexOf('--type');
  const type = typeIndex !== -1 ? args[typeIndex + 1] : 'auto';
  const verIndex = args.indexOf('--version');
  const customVersion = verIndex !== -1 ? args[verIndex + 1] : undefined;
  const dryRun = args.includes('--dry-run');

  runBump({ type, customVersion, dryRun });
}
