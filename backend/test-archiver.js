const archiver = require('archiver');
const fs = require('fs');

const archive = archiver('zip', { zlib: { level: 9 } });
archive.on('error', err => console.error(err));
const out = fs.createWriteStream('test.zip');
archive.pipe(out);
archive.append('hello world', { name: 'hello.txt' });
archive.finalize();
console.log("Success!");
