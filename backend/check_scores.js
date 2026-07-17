const Database = require('better-sqlite3');
const db = new Database('nube.db');
const files = db.prepare('SELECT originalName FROM files').all();
console.log(files);
