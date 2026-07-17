const Database = require('better-sqlite3');
const db = new Database('database.sqlite');
const files = db.prepare('SELECT originalName, savedName FROM files WHERE originalName IN ("IMG_5598.jpg", "IMG_6149.JPG", "IMG_5408.jpg", "IMG_5595.jpg")').all();
console.log(files);
