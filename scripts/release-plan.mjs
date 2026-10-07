/**
 * Release plan for one workflow run: channel, version and the tag each consumer
 * gets (GitHub Release, npm dist-tag, container image). Written as GitHub
 * Actions outputs, printed for humans otherwise.
 *
 *   node scripts/release-plan.mjs                 print the plan for this run
 *   node scripts/release-plan.mjs --set-version V stamp V into package.json
 *   node scripts/release-plan.mjs --self-test     pin the mapping table
 *
 * Channels (decision: .agents/pipelines/proposals/process/2026-10-07-multi-channel-release.md):
 *   nightly  built from a branch (scheduled from `dev`)  <package.json version>-nightly.<UTC YYYYMMDD>.<short sha>
 *   stable   push tag vX.Y.Z                              X.Y.Z
 * Nightlies are prereleases, so `releases/latest`, the npm `latest` dist-tag and
 * the `:latest` image stay on stable. A dispatched run is a dry run unless
 * publish=true. Any tag that is not vX.Y.Z aborts: nightly tags are created by
 * this workflow with GITHUB_TOKEN, and a hand-pushed one must never be read as a
 * stable release.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const PACKAGE_URL = new URL('../package.json', import.meta.url);
const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const DATE = /^\d{8}$/;
const SHA = /^[0-9a-f]{7,40}$/;
// The integration branch the scheduled nightly builds from; a dispatch from
// anywhere else still works but says so out loud.
const NIGHTLY_REF = 'dev';
// Published image. buildx reads a bare tag as a Docker Hub name (it tried to
// push library/0.1.0-nightly… on the first real run), so every image tag is
// emitted as a full ghcr.io reference.
const IMAGE = 'ghcr.io/cowjiang/agh-console';

function fail(message) {
  throw new Error(`release-plan: ${message}`);
}

function imageTags(tags) {
  return tags.map((tag) => `${IMAGE}:${tag}`);
}

export function plan(input) {
  const { eventName, refType, refName, sha, baseVersion, packageName, inputPublish, date } = input;
  const shortSha = String(sha).slice(0, 7);
  if (!SHA.test(shortSha)) fail(`SHA '${sha}' 不是提交哈希`);
  const warnings = [];
  // A dispatch never publishes on its own; a push and the nightly schedule do.
  const publish = eventName === 'workflow_dispatch' ? inputPublish === true : true;

  if (refType === 'tag') {
    const match = STABLE_TAG.exec(refName);
    if (!match) {
      fail(`tag ${refName} 不是 vX.Y.Z 稳定版格式；nightly 由定时任务从 ${NIGHTLY_REF} 发布，不要手推 nightly tag`);
    }
    const version = `${match[1]}.${match[2]}.${match[3]}`;
    if (baseVersion !== version) {
      warnings.push(
        `package.json 仍是 ${baseVersion}，与 tag ${refName} 不一致：稳定版发版后把它提到同一版本线，nightly 版本以它为基线`,
      );
    }
    return {
      channel: 'stable',
      version,
      releaseTag: refName,
      packageName,
      npmTag: 'latest',
      dockerTags: imageTags([version, `${match[1]}.${match[2]}`, 'latest', `sha-${shortSha}`]),
      prerelease: false,
      publish,
      warnings,
    };
  }

  if (!VERSION.test(baseVersion)) fail(`package.json 的 version '${baseVersion}' 不是 semver`);
  if (!DATE.test(date)) fail(`date '${date}' 不是 YYYYMMDD`);
  if (refName !== NIGHTLY_REF) {
    warnings.push(`nightly 通常从 ${NIGHTLY_REF} 构建，本次是 ${refName}`);
  }
  const version = `${baseVersion.split('-')[0]}-nightly.${date}.${shortSha}`;
  if (!VERSION.test(version)) fail(`算出的版本 '${version}' 不是 semver`);
  return {
    channel: 'nightly',
    version,
    releaseTag: `v${version}`,
    packageName,
    npmTag: 'nightly',
    // No `latest` here on purpose: nightly must not shadow the stable channel
    dockerTags: imageTags([version, 'nightly', `sha-${shortSha}`]),
    prerelease: true,
    publish,
    warnings,
  };
}

function outputs(result) {
  return [
    `channel=${result.channel}`,
    `version=${result.version}`,
    `release_tag=${result.releaseTag}`,
    `package_name=${result.packageName}`,
    `npm_tag=${result.npmTag}`,
    `docker_tags=${result.dockerTags.join(',')}`,
    `prerelease=${result.prerelease}`,
    `publish=${result.publish}`,
  ];
}

function runPlan() {
  const pkg = JSON.parse(readFileSync(PACKAGE_URL, 'utf8'));
  const sha = process.env.SHA;
  if (!sha) fail('SHA 未设置');
  const result = plan({
    eventName: process.env.EVENT_NAME || 'push',
    refType: process.env.REF_TYPE || 'branch',
    refName: process.env.REF_NAME || NIGHTLY_REF,
    sha,
    baseVersion: pkg.version,
    packageName: pkg.name,
    inputPublish: process.env.INPUT_PUBLISH === 'true',
    date: process.env.DATE || new Date().toISOString().slice(0, 10).replace(/-/g, ''),
  });
  const lines = outputs(result);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  console.log(`release-plan: ${lines.join(' ')}`);
  for (const warning of result.warnings) console.log(`::warning::${warning}`);
}

function setVersion(version) {
  if (!VERSION.test(version || '')) fail(`'${version}' 不是合法 semver`);
  const pkg = JSON.parse(readFileSync(PACKAGE_URL, 'utf8'));
  if (pkg.version === version) return console.log(`release-plan: package.json 已是 ${version}`);
  pkg.version = version;
  writeFileSync(PACKAGE_URL, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`release-plan: package.json version → ${version}`);
}

function selfTest() {
  const base = {
    eventName: 'schedule',
    refType: 'branch',
    refName: 'dev',
    sha: 'abc1234def5678',
    baseVersion: '0.1.0',
    packageName: 'agh-console',
    inputPublish: false,
    date: '20261007',
  };

  assert.deepEqual(plan(base), {
    channel: 'nightly',
    version: '0.1.0-nightly.20261007.abc1234',
    releaseTag: 'v0.1.0-nightly.20261007.abc1234',
    packageName: 'agh-console',
    npmTag: 'nightly',
    dockerTags: [
      'ghcr.io/cowjiang/agh-console:0.1.0-nightly.20261007.abc1234',
      'ghcr.io/cowjiang/agh-console:nightly',
      'ghcr.io/cowjiang/agh-console:sha-abc1234',
    ],
    prerelease: true,
    publish: true,
    warnings: [],
  });

  assert.deepEqual(plan({ ...base, eventName: 'push', refType: 'tag', refName: 'v1.2.3', baseVersion: '1.2.3' }), {
    channel: 'stable',
    version: '1.2.3',
    releaseTag: 'v1.2.3',
    packageName: 'agh-console',
    npmTag: 'latest',
    dockerTags: [
      'ghcr.io/cowjiang/agh-console:1.2.3',
      'ghcr.io/cowjiang/agh-console:1.2',
      'ghcr.io/cowjiang/agh-console:latest',
      'ghcr.io/cowjiang/agh-console:sha-abc1234',
    ],
    prerelease: false,
    publish: true,
    warnings: [],
  });

  // A stable tag whose package.json has not been bumped still releases, with a warning.
  const stale = plan({ ...base, eventName: 'push', refType: 'tag', refName: 'v1.2.3' });
  assert.equal(stale.version, '1.2.3');
  assert.equal(stale.warnings.length, 1);

  // Dispatch is a dry run unless asked to publish; a dispatch from a branch is a nightly.
  assert.equal(plan({ ...base, eventName: 'workflow_dispatch' }).publish, false);
  assert.equal(plan({ ...base, eventName: 'workflow_dispatch', inputPublish: true }).publish, true);
  assert.equal(plan({ ...base, eventName: 'workflow_dispatch', refName: 'main' }).channel, 'nightly');
  assert.deepEqual(plan({ ...base, eventName: 'workflow_dispatch', refName: 'main' }).warnings, [
    'nightly 通常从 dev 构建，本次是 main',
  ]);
  const dispatchedStable = plan({
    ...base,
    eventName: 'workflow_dispatch',
    inputPublish: true,
    refType: 'tag',
    refName: 'v2.0.0',
    baseVersion: '2.0.0',
  });
  assert.equal(dispatchedStable.channel, 'stable');
  assert.equal(dispatchedStable.publish, true);

  // Every image tag must be a full reference: buildx reads a bare tag as Docker Hub.
  for (const result of [plan(base), plan({ ...base, refType: 'tag', refName: 'v1.2.3', baseVersion: '1.2.3' })]) {
    for (const tag of result.dockerTags) {
      assert.ok(tag.startsWith(`${IMAGE}:`), `image tag is not fully qualified: ${tag}`);
    }
  }

  // A prerelease base keeps its core version; the nightly line stays semver-clean.
  assert.equal(plan({ ...base, baseVersion: '1.0.0-rc.1' }).version, '1.0.0-nightly.20261007.abc1234');

  // Loud failures: hand-pushed nightly tags, malformed tags, bad input.
  assert.throws(() => plan({ ...base, refType: 'tag', refName: 'v0.1.0-nightly.20261007.abc1234' }), /不是 vX\.Y\.Z/);
  assert.throws(() => plan({ ...base, refType: 'tag', refName: 'v1.2' }), /不是 vX\.Y\.Z/);
  assert.throws(() => plan({ ...base, sha: 'HEAD' }), /不是提交哈希/);
  assert.throws(() => plan({ ...base, baseVersion: 'nope' }), /不是 semver/);
  assert.throws(() => plan({ ...base, date: '2026-10-07' }), /不是 YYYYMMDD/);

  console.log('release-plan: self-test ok（nightly/stable/dispatch、非法 tag/semver/sha 拒绝、镜像引用全限定）');
}

const [flag, value] = process.argv.slice(2);
if (flag === '--self-test') selfTest();
else if (flag === '--set-version') setVersion(value);
else if (flag) fail(`未知参数 ${flag}`);
else runPlan();
