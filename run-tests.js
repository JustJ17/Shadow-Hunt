const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const outPath = path.join(__dirname, 'test-out.txt');
const ws = fs.createWriteStream(outPath);

const child = spawn('npx', ['vitest', 'run'], {
  cwd: __dirname,
  shell: true,
  env: { ...process.env },
});

child.stdout.pipe(ws);
child.stderr.pipe(ws);

child.on('close', (code) => {
  ws.write(`\nExit code: ${code}\n`);
  ws.end();
});

