const Database = require('better-sqlite3');
const db = new Database('./nube.db');
const people = db.prepare(`
      SELECT p.id, p.name, p.coverFileId, f.savedName as coverFile,
             COUNT(DISTINCT ff.fileId) as faceCount 
      FROM people p 
      LEFT JOIN file_faces ff ON p.id = ff.personId 
      LEFT JOIN files f ON p.coverFileId = f.id 
      WHERE p.isHidden = 0
      GROUP BY p.id 
      LIMIT 2
`).all();
console.log("People Query:", people);
