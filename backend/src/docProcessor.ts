import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import Database from 'better-sqlite3';
import path from 'path';

console.log('[Doc Worker] Starting Document Intelligence Worker...');

const STORAGE_PATH = process.env.STORAGE_PATH || path.resolve(__dirname, '..', '..', 'storage');
const docDbPath = path.resolve(STORAGE_PATH, 'documents.db');
const docDb = new Database(docDbPath);

const redisConnection = new IORedis({ host: process.env.REDIS_HOST || '127.0.0.1', maxRetriesPerRequest: null });

// Worker for basic doc processing (no longer auto-clustering)
const worker = new Worker('doc-processing', async job => {
  const { id } = job.data;
  console.log(`[Doc Worker] Processing doc: ${id}`);
  
  const doc = docDb.prepare(`SELECT * FROM docs WHERE id = ?`).get(id) as any;
  if (!doc) return;

  // Generate thumbnail using macOS QuickLook
  try {
    if (!doc.mimeType?.startsWith('image/')) {
      const fs = require('fs');
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      const filePath = doc.absolutePath || path.join(STORAGE_PATH, doc.savedName);
      const thumbnailDir = path.join(STORAGE_PATH, 'thumbnails');
      
      if (!fs.existsSync(thumbnailDir)) {
        fs.mkdirSync(thumbnailDir, { recursive: true });
      }

      if (fs.existsSync(filePath)) {
        console.log(`[Doc Worker] Generating thumbnail for: ${doc.name}`);
        // Run qlmanage (creates file named: <basename>.png)
        await execPromise(`qlmanage -t -s 800 -o "${thumbnailDir}" "${filePath}"`);
        
        const basename = path.basename(filePath);
        const qlmanageOutput = path.join(thumbnailDir, `${basename}.png`);
        const finalThumbnailPath = path.join(thumbnailDir, `thumb-${doc.savedName}.png`);
        
        if (fs.existsSync(qlmanageOutput)) {
          fs.renameSync(qlmanageOutput, finalThumbnailPath);
          console.log(`[Doc Worker] Thumbnail generated: thumb-${doc.savedName}.png`);
        }
      }
    }
  } catch (e: any) {
    console.log(`[Doc Worker] Thumbnail generation failed for ${id}:`, e.message);
  }

  // Just set status to READY so it shows up in root folder
  docDb.prepare(`
    UPDATE docs SET status = 'READY' WHERE id = ?
  `).run(id);

  // Send SSE to let desktop client know it's done
  const body = JSON.stringify({ fileId: id, step: 'upload_done', label: 'Upload Completo', originalName: doc.originalName || doc.name, contentType: 'drive' });
  const options = {
    hostname: '127.0.0.1',
    port: Number(process.env.PORT || 3001),
    path: '/api/worker-event',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  };
  const req = require('http').request(options);
  req.on('error', () => {});
  req.write(body);
  req.end();

  console.log(`[Doc Worker] Finished doc: ${id}`);
  return { success: true };
}, { connection: redisConnection as any });

worker.on('failed', (job, err) => {
  console.error(`[Doc Worker] Job ${job?.id} failed:`, err);
});
