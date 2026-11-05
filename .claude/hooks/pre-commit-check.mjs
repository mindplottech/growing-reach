// Claude Code hook (PreToolUse, Bash): before Claude runs `git commit`, run the tests and the
// ledger check. If either fails, the commit is blocked (exit 2) and the reason goes back to
// Claude. This makes the CLAUDE.md rule "コミットの前に毎回 npm test" a mechanism, not a habit.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let command = '';
  try { command = JSON.parse(input).tool_input?.command ?? ''; } catch { process.exit(0); }
  if (!/\bgit\b[^|;&]*\bcommit\b/.test(command)) process.exit(0);

  const run = (label, cmd, args) => {
    const result = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
    return { label, ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  };
  const checks = [
    run('npm test', 'npm', ['test', '--silent']),
    run('台帳の検証', 'node', ['scripts/check-ledger.mjs']),
  ];
  const failed = checks.filter(({ ok }) => !ok);
  if (failed.length === 0) {
    console.log('コミット前の確認：npm test と台帳の検証が通りました');
    process.exit(0);
  }
  const tail = (text) => text.trim().split('\n').filter((line) => /^\s*not ok|^# fail|問題|^- |Error/.test(line)).slice(-15).join('\n');
  process.stderr.write(`コミットを止めました（.claude/hooks/pre-commit-check.mjs）。通らなかった確認：${failed.map(({ label }) => label).join('・')}\n`);
  for (const { label, out } of failed) process.stderr.write(`\n[${label}]\n${tail(out)}\n`);
  process.stderr.write('\n直してから、もう一度コミットしてください。CLAUDE.md の決まり：失敗したら止めて KO に見せる。\n');
  process.exit(2);
});
