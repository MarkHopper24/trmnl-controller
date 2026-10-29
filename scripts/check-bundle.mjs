import { execFileSync } from 'node:child_process';

const changes = execFileSync('git', [
  'status', '--porcelain', '--untracked-files=all', '--',
  'plugins/trmnl-controller', '.agents/plugins/marketplace.json'
], { encoding: 'utf8' });
if (changes) {
  console.error('Regenerate and commit the complete marketplace package before publishing:\n' + changes);
  process.exitCode = 1;
} else {
  console.log('Committed marketplace package matches the source build.');
}
