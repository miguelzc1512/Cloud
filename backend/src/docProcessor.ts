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

  try {
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
      let finalThumbnailPath: string | null = null;
      const thumbFilename = `thumb-${doc.savedName}.png`;
      const expectedThumbPath = path.join(thumbnailDir, thumbFilename);

      if (doc.mimeType?.startsWith('video/')) {
        console.log(`[Doc Worker] Generating video thumbnail for: ${doc.name}`);
        const ffmpeg = require('fluent-ffmpeg');
        const ffmpegStatic = require('ffmpeg-static');
        ffmpeg.setFfmpegPath(ffmpegStatic);
        
        await new Promise((resolve, reject) => {
           ffmpeg(filePath)
            .screenshots({ timestamps: ['10%'], filename: thumbFilename, folder: thumbnailDir, size: '800x?' })
            .on('end', resolve)
            .on('error', reject);
        });
        
        if (fs.existsSync(expectedThumbPath)) finalThumbnailPath = expectedThumbPath;
      } else if (!doc.mimeType?.startsWith('image/')) {
        if (process.platform === 'darwin') {
          console.log(`[Doc Worker] Generating macOS QuickLook thumbnail for: ${doc.name}`);
          await execPromise(`qlmanage -t -s 800 -o "${thumbnailDir}" "${filePath}"`);
          const basename = path.basename(filePath);
          const qlmanageOutput = path.join(thumbnailDir, `${basename}.png`);
          if (fs.existsSync(qlmanageOutput)) {
            fs.renameSync(qlmanageOutput, expectedThumbPath);
            finalThumbnailPath = expectedThumbPath;
          }
        }
      }

      // Generate Blurhash
      if (finalThumbnailPath || doc.mimeType?.startsWith('image/')) {
         const imagePathToBlur = finalThumbnailPath || filePath;
         const sharp = require('sharp');
         const { encode } = require('blurhash');
         
         const { data, info } = await sharp(imagePathToBlur)
            .resize(32, 32, { fit: 'inside' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
            
         const blurhash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
         
         docDb.prepare(`UPDATE docs SET thumbnailName = ?, blurhash = ? WHERE id = ?`)
            .run(finalThumbnailPath ? thumbFilename : null, blurhash, id);
            
         console.log(`[Doc Worker] Blurhash generated for: ${doc.name}`);
      }
    }
  } catch (e: any) {
    console.log(`[Doc Worker] Thumbnail/Blurhash generation failed for ${id}:`, e.message);
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
