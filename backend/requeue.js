const Database = require('better-sqlite3');
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const db = new Database('nube.db');
const redisConnection = new IORedis({ maxRetriesPerRequest: null });
const imageQueue = new Queue('image-processing', { connection: redisConnection });

async function run() {
  const pendingFiles = db.prepare(`SELECT id, savedName, originalName FROM files WHERE status = 'PENDING' AND mimeType LIKE 'image/%' AND isDeleted = 0`).all();
  console.log(`Re-queueing ${pendingFiles.length} files...`);
  
  for (const file of pendingFiles) {
    await imageQueue.add('process-image', {
      fileId: file.id,
      savedName: file.savedName,
      originalName: file.originalName,
      mimeType: 'image/jpeg' // mock
    });
  }
  console.log('Done');
  process.exit(0);
}

run();
