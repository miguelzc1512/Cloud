import Database from 'better-sqlite3';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const db = new Database('nube.db');
const redis = new Redis();
const imageQueue = new Queue('image-processing', { connection: redis as any });

const files = db.prepare("SELECT id, savedName, originalName, mimeType FROM files WHERE originalName LIKE '%.heic'").all() as any[];

console.log(`Found ${files.length} HEIC files to re-process for orientation.`);

async function enqueue() {
  for (const file of files) {
    // Reset status to PROCESSING
    db.prepare("UPDATE files SET status = 'PROCESSING' WHERE id = ?").run(file.id);
    
    await imageQueue.add('process-image', {
      fileId: file.id,
      savedName: file.savedName,
      originalName: file.originalName,
      mimeType: file.mimeType
    });
    console.log(`Enqueued ${file.originalName}`);
  }
  console.log('All HEIC files enqueued for rotation fix!');
  process.exit(0);
}

enqueue();
