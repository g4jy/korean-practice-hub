const {spawnSync} = require('node:child_process'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const file of fs.readdirSync(root + '/js')) {
  const result = spawnSync(process.execPath, ['--check', root + '/js/' + file], {stdio: 'inherit'}); if (result.status !== 0) process.exit(1);
}
for (const file of ['content.cjs', 'audio-playback.cjs', 'isolation.cjs', 'builders.cjs', 'lesson-updates.cjs', 'lesson-updates-audit.cjs', 'submissions.cjs', 'submission-dom.cjs', 'vocabulary-states.cjs']) {
  const result = spawnSync(process.execPath, [path.join(__dirname,file)], {stdio:'inherit'}); if (result.status !== 0) process.exit(1);
}
console.log('All offline checks passed. Browser and Edge asset verification are separate checks.');
