/**
 * Packs the npm tarball and asserts what is inside it — the artifact that
 * `npm publish` ships is the artifact that was verified here.
 *
 * Why this guard exists: npm falls back to .gitignore when there is no
 * .npmignore, so without a `files` allowlist the package ships src/,
 * src-tauri/, docs/ and .agents/ while leaving the gitignored dist/ out — a
 * package that installs fine and then serves 503 "前端尚未构建".
 *
 * Usage: node scripts/check-npm-pack.mjs   (must run after `pnpm build`)
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const REQUIRED = [
  'package.json',
  'README.md',
  'LICENSE',
  'dist/index.html',
  'server/index.mjs',
  'server/proxy.mjs',
];
// Anything the runtime does not read: shipping it only bloats the tarball, and
// these trees are where the accidental-inclusion risk lives.
const FORBIDDEN = [
  'src/',
  'src-tauri/',
  'scripts/',
  'docs/',
  '.github/',
  '.agents/',
  '.local-backup/',
  'contract/',
  'node_modules/',
];

const raw = execFileSync('npm', ['pack', '--json', '--ignore-scripts'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const start = raw.indexOf("[");
const end = raw.lastIndexOf("]");
const [packed] = JSON.parse(start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw);
const entries = new Map(packed.files.map((file) => [file.path, file]));

const errors = [];
for (const path of REQUIRED) {
  if (!entries.has(path)) errors.push(`缺少必要文件: ${path}`);
}
for (const path of entries.keys()) {
  const prefix = FORBIDDEN.find((candidate) => path.startsWith(candidate));
  if (prefix) errors.push(`混入不该发布的路径: ${path}（${prefix}）`);
  if (path.endsWith('.test.mjs')) errors.push(`混入测试文件: ${path}`);
}

// npx resolves the command from a single bin entry (npm exec: "if the package
// has a single entry in its bin field ... that command will be used"), so the
// entry must exist, be executable and carry a shebang.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const bins = Object.entries(pkg.bin ?? {});
if (bins.length !== 1) errors.push(`bin 必须只有一个条目（npx 靠它解析命令），当前 ${bins.length} 个`);
for (const [name, target] of bins) {
  const entry = entries.get(target);
  if (!entry) {
    errors.push(`缺少 bin 目标: ${name} → ${target}`);
    continue;
  }
  if ((entry.mode & 0o111) === 0) errors.push(`bin 不可执行（mode ${entry.mode.toString(8)}）: ${target}`);
  if (!readFileSync(target, 'utf8').startsWith('#!')) errors.push(`bin 缺 shebang: ${target}`);
}

if (errors.length) {
  console.error('check-npm-pack: FAILED');
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}
console.log(
  `check-npm-pack: ok（${packed.filename}，${packed.entryCount} 个文件，解包 ${(packed.unpackedSize / 1024).toFixed(0)} KiB）`,
);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tarball=${packed.filename}\n`);
