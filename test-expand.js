const os = require('os');
const path = require('path');
function expand(dir) {
  if (dir.startsWith('~')) return path.join(os.homedir(), dir.slice(1));
  return dir;
}
console.log(expand('~/Desktop'));
