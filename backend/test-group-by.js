const Database = require('better-sqlite3');
const db = new Database('./nube.db');

const row = db.prepare(`
    SELECT p.id, p.name, p.coverFileId, f.savedName as coverFile
    FROM people p 
    LEFT JOIN file_faces ff ON p.id = ff.personId 
    LEFT JOIN files f ON p.coverFileId = f.id 
    WHERE p.id = 'ec8dc252-16d1-4193-8157-96e152db6a72'
    GROUP BY p.id 
`).get();

console.log("Group by query:", row);

const files = db.prepare(`SELECT savedName FROM files WHERE id = ?`).get(row.coverFileId);
console.log("Direct query:", files);

