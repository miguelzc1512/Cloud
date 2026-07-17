const Database = require('better-sqlite3');
const db = new Database('./nube.db');

const ids = ['ec8dc252-16d1-4193-8157-96e152db6a72']; // My ID
const placeholders = ids.map(() => '?').join(',');

const coOccurring = db.prepare(`
    SELECT p.id, p.name, f.savedName as coverFile,
           COUNT(DISTINCT ff2.fileId) as coOccurCount
    FROM file_faces ff2
    JOIN people p ON ff2.personId = p.id
    LEFT JOIN files f ON p.coverFileId = f.id
    WHERE ff2.fileId IN (
        SELECT fileId
        FROM file_faces
        WHERE personId IN (${placeholders})
        GROUP BY fileId
        HAVING COUNT(DISTINCT personId) = ?
    )
    AND p.id NOT IN (${placeholders})
    AND p.isHidden = 0
    GROUP BY p.id
    ORDER BY coOccurCount DESC
    LIMIT 5
`).all(...ids, ids.length, ...ids);

console.log("Co-occurring people:", coOccurring);
