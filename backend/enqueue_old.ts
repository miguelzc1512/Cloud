import Database from 'better-sqlite3';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const db = new Database('nube.db');
const redis = new Redis();
const imageQueue = new Queue('image-processing', { connection: redis as any });

const files = db.prepare("SELECT id, savedName FROM files WHERE thumbnailName IS NULL").all() as any[];

console.log(`Found ${files.length} old files to process.`);

async function enqueue() {
  for (const file of files) {
    await imageQueue.add('process-image', {
      id: file.id,
      savedName: file.savedName
    });
    console.log(`Enqueued ${file.id}`);
  }
  console.log('All files enqueued for processing!');
  process.exit(0);
}

enqueue();
