// Claude Code hook (PostToolUse, Edit|Write): right after Claude changes the values ledger,
// check it. Problems (a value without a known source, a category upgraded, a formula's
// coefficient written into code) go straight back to Claude (exit 2) to be fixed.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let file = '';
  try { file = JSON.parse(input).tool_input?.file_path ?? ''; } catch { process.exit(0); }
  const watched = /values_ledger\.json$/.test(file) || /[\\/](sim|render)[\\/][^\\/]+\.js$/.test(file);
  if (!watched) process.exit(0);
  const result = spawnSync('node', ['scripts/check-ledger.mjs'], { cwd: root, encoding: 'utf8' });
  if (result.status === 0) process.exit(0);
  process.stderr.write(`台帳の検証が通りません（${file} を変えた直後）：\n${result.stderr || result.stdout}`);
  process.exit(2);
});
