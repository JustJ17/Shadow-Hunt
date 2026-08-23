const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(dirPath);
  });
}

walk('lib/turn-engine', (f) => {
  if (f.endsWith('.ts')) {
    const c = fs.readFileSync(f, 'utf8');
    if (c.includes('padStart(5, "0")')) {
      fs.writeFileSync(f, c.replace(/padStart\(5, "0"\)/g, 'padStart(3, "0")'));
    }
  }
});
