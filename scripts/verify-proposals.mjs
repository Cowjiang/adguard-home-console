/**
 * 提案与记录约定校验 — .agents/pipelines 的文件名/分类/状态，以及 .agents/reviews 的快照命名。
 * 用法:node scripts/verify-proposals.mjs [--links]
 *   --links  额外核对文档里引用的具体路径是否存在（默认关闭:证据路径允许"01–09*.png"这类区间简写）
 * 约定依据:.agents/pipelines/WORKFLOW.md、.agents/pipelines/CLASSIFICATION.md、.agents/README.md
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CLASSES = ['feature', 'bug-fix', 'architecture', 'simplification', 'process', 'testing'];
const PROPOSAL_NAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+){1,5}\.md$/;
const REVIEW_NAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)+$/;
const LINK_RE = /(?:^|[\s`(（])((?:\.agents|docs|scripts|src)\/[A-Za-z0-9_./-]+\.(?:tsx|jsx|mjs|json|swift|yaml|yml|png|svg|css|ts|js|md|sh|rs))/gm;
const SKIP_LINK_PREFIX = ['.agents/evidence/'];
const PIPELINES = '.agents/pipelines';
const REVIEWS = '.agents/reviews';
const LIFECYCLES = {
  proposals: new Set(['proposed', 'implemented']),
  rejected: new Set(['rejected']),
  archives: new Set(['archived']),
};

const errors = [];
const warnings = [];
const counts = Object.fromEntries(CLASSES.map((cls) => [cls, 0]));

function headerValue(raw, key) {
  const match = raw.match(new RegExp(`\\*\\*${key}:\\*\\*\\s*([^\\n]+)`));
  return match ? match[1].trim() : '';
}

function collectMarkdown(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collectMarkdown(path));
    else if (entry.name.endsWith('.md')) found.push(path);
  }
  return found;
}

function checkLifecycle(name) {
  const root = join(PIPELINES, name);
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !CLASSES.includes(entry.name)) continue;
    const dir = join(root, entry.name);
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      const path = join(dir, file);
      const raw = readFileSync(path, 'utf8');
      const cls = headerValue(raw, 'Class');
      const status = headerValue(raw, 'Status');
      if (!PROPOSAL_NAME.test(file)) {
        errors.push(`${path}: 文件名应为 YYYY-MM-DD-<slug>.md（slug 2–6 个 kebab 词）`);
      }
      if (cls !== entry.name) errors.push(`${path}: Class '${cls}' 与所在目录 '${entry.name}' 不一致`);
      if (!CLASSES.includes(cls)) errors.push(`${path}: Class '${cls}' 不在封闭集内`);
      if (!LIFECYCLES[name].has(status)) errors.push(`${path}: Status '${status}' 不适用于 ${name}/`);
      counts[entry.name] += 1;
    }
  }
}

function checkReviews() {
  if (!existsSync(REVIEWS)) return;
  for (const name of readdirSync(REVIEWS)) {
    if (name === 'README.md' || name === '.gitkeep') continue;
    if (!REVIEW_NAME.test(name.replace(/\.md$/, ''))) {
      errors.push(`${join(REVIEWS, name)}: 快照名应为 YYYY-MM-DD-<kebab>（见 .agents/README.md 命名规则）`);
    }
  }
}

function checkLinks() {
  const files = ['AGENTS.md', ...collectMarkdown('.agents'), ...collectMarkdown('docs')];
  let checked = 0;
  const missing = new Set();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(LINK_RE)) {
      const target = match[1];
      if (SKIP_LINK_PREFIX.some((prefix) => target.startsWith(prefix))) continue;
      checked += 1;
      if (!existsSync(target)) missing.add(`${file} → ${target}`);
    }
  }
  for (const item of missing) warnings.push(`${item} 指向的文件不存在`);
  return checked;
}

for (const name of Object.keys(LIFECYCLES)) checkLifecycle(name);
checkReviews();

const linksChecked = process.argv.includes('--links') ? checkLinks() : null;

if (errors.length) {
  console.error('verify-proposals: FAILED');
  for (const error of errors) console.error(`  error: ${error}`);
  process.exit(1);
}

const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
const breakdown = CLASSES.map((cls) => `${cls}=${counts[cls]}`).join(', ');
console.log(`verify-proposals: ok（提案 ${total} 份；${breakdown}）`);

if (linksChecked !== null) {
  for (const warning of warnings) console.warn(`  warn: ${warning}`);
  console.log(`verify-proposals: 路径核对 ${linksChecked} 处，缺失 ${warnings.length} 处`);
}
