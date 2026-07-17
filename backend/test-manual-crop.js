const Database = require('better-sqlite3');
const db = new Database('./nube.db');
const sharp = require('sharp');
const path = require('path');

const storagePath = '../storage';
const absoluteStoragePath = path.resolve(__dirname, storagePath);

async function extractFace(personId) {
    let faceRow = db.prepare(`
      SELECT ff.boxX, ff.boxY, ff.boxW, ff.boxH, f.thumbnailName, f.savedName
      FROM people p
      JOIN file_faces ff ON p.id = ff.personId AND p.coverFileId = ff.fileId
      JOIN files f ON ff.fileId = f.id
      WHERE p.id = ?
    `).get(personId);

    if (!faceRow) {
        console.log("No cover face found, falling back...");
        faceRow = db.prepare(`
            SELECT ff.boxX, ff.boxY, ff.boxW, ff.boxH, f.thumbnailName, f.savedName
            FROM file_faces ff
            JOIN files f ON ff.fileId = f.id
            WHERE ff.personId = ?
            LIMIT 1
        `).get(personId);
    }
    
    if (!faceRow) {
        console.log("No face found at all");
        return;
    }

    const imageToUse = faceRow.thumbnailName || faceRow.savedName;
    const imagePath = path.join(absoluteStoragePath, imageToUse);

    const metadata = await sharp(imagePath).metadata();
    const w = metadata.width || 1;
    const h = metadata.height || 1;

    let left = Math.max(0, Math.floor(faceRow.boxX - faceRow.boxW * 0.2));
    let top = Math.max(0, Math.floor(faceRow.boxY - faceRow.boxH * 0.2));
    let width = Math.min(w - left, Math.floor(faceRow.boxW * 1.4));
    let height = Math.min(h - top, Math.floor(faceRow.boxH * 1.4));

    console.log(`Person ${personId} face box: left=${left}, top=${top}, width=${width}, height=${height}, image=${imageToUse}`);
}

const person = db.prepare('SELECT id FROM people LIMIT 1').get();
if (person) {
    console.log("Testing with person ID:", person.id);
    extractFace(person.id);
}
