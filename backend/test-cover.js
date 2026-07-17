const Database = require('better-sqlite3');
const db = new Database('./nube.db');
const people = db.prepare('SELECT id, name, coverFileId FROM people WHERE coverFileId IS NOT NULL LIMIT 2').all();
console.log("People with coverFileId:", people);
if (people.length > 0) {
    const personId = people[0].id;
    const faceRow = db.prepare(`
      SELECT ff.boxX, ff.boxY, ff.boxW, ff.boxH, f.thumbnailName, f.savedName, ff.fileId, ff.personId, p.coverFileId
      FROM people p
      JOIN file_faces ff ON p.id = ff.personId AND p.coverFileId = ff.fileId
      JOIN files f ON ff.fileId = f.id
      WHERE p.id = ?
    `).get(personId);
    console.log("Face row found:", faceRow);
}
