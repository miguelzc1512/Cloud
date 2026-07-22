import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import sharp from 'sharp';
import exifr from 'exifr';
import { encode } from 'blurhash';
import path from 'path';
import fs from 'fs';
import http from 'http';
import Database from 'better-sqlite3';
import { pipeline, env } from '@huggingface/transformers';
import { detectFacesInImage } from './faceUtils';
import crypto from 'crypto';
import './docProcessor';

// ─── SSE helper: envía eventos de progreso al backend principal ─────────────
function emitWorkerStep(fileId: string, step: string, label: string, originalName?: string, retries = 3) {
  const body = JSON.stringify({ fileId, step, label, originalName });
  const hostname = process.env.API_HOST || (process.env.REDIS_HOST === 'redis' ? 'backend-api' : '127.0.0.1');
  const port = Number(process.env.PORT || 3001);
  const options = {
    hostname,
    port,
    path: '/api/worker-event',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  };
  const req = http.request(options);
  req.on('error', (e) => {
    if (retries > 0) {
      setTimeout(() => emitWorkerStep(fileId, step, label, originalName, retries - 1), 500);
    } else {
      console.error(`[Worker] Falló emitir evento SSE a ${hostname}:${port} tras varios intentos: ${e.message}`);
    }
  });
  req.write(body);
  req.end();
}

// Configurar paths
const storagePath = process.env.STORAGE_PATH || '../storage';
const absoluteStoragePath = path.resolve(__dirname, '..', storagePath);

// Configurar Redis
const redisConnection = new IORedis({ host: process.env.REDIS_HOST || '127.0.0.1', maxRetriesPerRequest: null });

// Configurar SQLite
const STORAGE_PATH = process.env.STORAGE_PATH || path.resolve(__dirname, '..', '..', 'storage');
const dbPath = path.resolve(STORAGE_PATH, 'nube.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// ─── AI Models (Singleton for the worker) ─────────────────────────────
let visionPipeline: any = null;

async function initModels() {
  console.log('[Worker] Loading AI Models...');
  try {
    env.localModelPath = './models';
    env.allowRemoteModels = true;
    visionPipeline = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
    console.log('[Worker] AI Models loaded successfully.');
  } catch (e) {
    console.error('[Worker] Error loading models:', e);
  }
}
initModels();

// ─── Queries preparadas para actualizar base de datos ───────────────────
const imageQueue = new Queue('image-processing', { connection: redisConnection as any });

const updateFileThumbnailStmt = db.prepare(`
  UPDATE files SET
    thumbnailName = @thumbnailName,
    blurhash = @blurhash,
    width = @width,
    height = @height,
    takenAt = COALESCE(@takenAt, takenAt),
    latitude = COALESCE(@latitude, latitude),
    longitude = COALESCE(@longitude, longitude)
  WHERE id = @id
`);

const updateFileEmbeddingStmt = db.prepare(`
  UPDATE files SET embedding = @embedding WHERE id = @id
`);

const updateFileReadyStmt = db.prepare(`
  UPDATE files SET status = 'READY' WHERE id = @id
`);

const updateFacesStmt = db.prepare(`UPDATE files SET faces = ? WHERE id = ?`);

const worker = new Worker('image-processing', async job => {
  const { fileId, savedName, originalName, mimeType, absolutePath } = job.data;
  const start = Date.now();
  let filePath = (absolutePath && fs.existsSync(absolutePath)) ? absolutePath : path.join(absoluteStoragePath, savedName);
  let tempJpegPath: string | null = null;
  const thumbnailName = `thumbnails/thumb-${savedName}.webp`;
  const thumbnailPath = path.join(absoluteStoragePath, thumbnailName);

  try {
    if (!mimeType.startsWith('image/')) {
       updateFileThumbnailStmt.run({
           id: fileId, thumbnailName: null, blurhash: null, width: null, height: null, 
           takenAt: null, latitude: null, longitude: null
       });
       updateFileEmbeddingStmt.run({ id: fileId, embedding: null });
       updateFileReadyStmt.run({ id: fileId });
       return;
    }

    if (job.name === 'generate-thumbnail') {
      console.log(`[Worker] Empezando a procesar miniatura ${originalName} (${fileId})`);
      
      if (originalName.toLowerCase().endsWith('.heic')) {
        try {
          const { execSync } = require('child_process');
          tempJpegPath = path.join(absoluteStoragePath, `temp_${fileId}.jpg`);
          execSync(`sips -s format jpeg "${filePath}" --out "${tempJpegPath}"`);
          filePath = tempJpegPath;
        } catch (e) {
          console.error(`[Worker] Error convirtiendo HEIC a JPG con sips para ${originalName}`, e);
        }
      }

      const image = sharp(filePath, { unlimited: true }).rotate();
      const metadata = await image.metadata();
      
      const thumbnailsDir = path.join(absoluteStoragePath, 'thumbnails');
      if (!fs.existsSync(thumbnailsDir)) {
        fs.mkdirSync(thumbnailsDir, { recursive: true });
      }

      emitWorkerStep(fileId, 'thumbnail', 'Creando miniatura...', originalName);
      await image.clone()
        .resize({ width: 800, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(thumbnailPath);

      if (originalName.toLowerCase().endsWith('.heic')) {
        const webPath = path.join(absoluteStoragePath, `thumbnails/web-${savedName}.webp`);
        await image.clone()
          .resize({ width: 2560, withoutEnlargement: true })
          .webp({ quality: 90 })
          .toFile(webPath);
      }

      const { data: rawData, info: rawInfo } = await image.clone()
        .raw()
        .ensureAlpha()
        .resize(32, 32, { fit: 'inside' })
        .toBuffer({ resolveWithObject: true });
      
      const blurhashStr = encode(new Uint8ClampedArray(rawData), rawInfo.width, rawInfo.height, 4, 4);

      let takenAt = null;
      let latitude = null;
      let longitude = null;
      try {
        const exifData = await exifr.parse(filePath);
        if (exifData) {
          if (exifData.DateTimeOriginal) takenAt = new Date(exifData.DateTimeOriginal).toISOString();
          if (exifData.latitude !== undefined) latitude = exifData.latitude;
          if (exifData.longitude !== undefined) longitude = exifData.longitude;
        }
      } catch(e) {}

      updateFileThumbnailStmt.run({
        id: fileId,
        thumbnailName,
        blurhash: blurhashStr,
        width: metadata.width,
        height: metadata.height,
        takenAt,
        latitude,
        longitude
      });

      if (tempJpegPath) {
        try { fs.unlinkSync(tempJpegPath); } catch(e) {}
      }

      // Chain next job
      await imageQueue.add('generate-embedding', job.data, { priority: 2, jobId: `embed-${fileId}` });
      emitWorkerStep(fileId, 'thumbnail_done', 'Miniatura lista', originalName);

    } else if (job.name === 'generate-embedding') {
      console.log(`[Worker] Generando embedding para ${originalName} (${fileId})`);
      
      if (originalName.toLowerCase().endsWith('.heic')) {
        // We use the generated high-res webp for embedding HEIC
        filePath = path.join(absoluteStoragePath, `thumbnails/web-${savedName}.webp`);
      }

      emitWorkerStep(fileId, 'embedding', 'Analizando contenido con IA...', originalName);
      let embeddingStr = null;
      if (visionPipeline) {
        try {
           const output = await visionPipeline(filePath);
           embeddingStr = JSON.stringify(Array.from(output.data));
        } catch (e) {
           console.error('[Worker] Falló embedding para', originalName);
        }
      }

      updateFileEmbeddingStmt.run({
        id: fileId,
        embedding: embeddingStr
      });

      // Chain next job
      await imageQueue.add('detect-faces', job.data, { priority: 3, jobId: `faces-${fileId}` });
      emitWorkerStep(fileId, 'embedding_done', 'Embedding listo', originalName);

    } else if (job.name === 'detect-faces') {
      console.log(`[Worker] Detectando rostros en ${originalName} (${fileId})`);
      emitWorkerStep(fileId, 'faces', 'Detectando rostros...', originalName);
      try {
        const faces = await detectFacesInImage(thumbnailPath);
        
        if (faces && faces.length > 0) {
          for (const face of faces) {
            const descriptorStr = JSON.stringify(face.descriptor);
            
            const existingFaces = db.prepare(`SELECT id, personId, descriptor FROM file_faces`).all() as any[];
            let matchedPersonId = null;
            let minDistance = 0.5;

            for (const ef of existingFaces) {
              const efDescriptor = JSON.parse(ef.descriptor) as number[];
              let distance = 0;
              for (let i = 0; i < 128; i++) {
                distance += Math.pow((face.descriptor as number[])[i] - efDescriptor[i], 2);
              }
              distance = Math.sqrt(distance);
              
              if (distance < minDistance) {
                minDistance = distance;
                matchedPersonId = ef.personId;
              }
            }

            if (!matchedPersonId) {
              matchedPersonId = crypto.randomUUID();
              db.prepare(`INSERT INTO people (id, name, coverFileId) VALUES (?, ?, ?)`).run(matchedPersonId, 'Desconocido', fileId);
            } else {
              db.prepare(`UPDATE people SET coverFileId = COALESCE(coverFileId, ?) WHERE id = ?`).run(fileId, matchedPersonId);
            }

            db.prepare(`
              INSERT INTO file_faces (id, fileId, personId, descriptor, boxX, boxY, boxW, boxH)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              crypto.randomUUID(), fileId, matchedPersonId, descriptorStr, 
              face.box.x, face.box.y, face.box.width, face.box.height
            );
          }
          
          updateFacesStmt.run(JSON.stringify(faces.map(f => f.box)), fileId);
          emitWorkerStep(fileId, 'faces', `Se ${faces.length === 1 ? 'encontró 1 rostro' : `encontraron ${faces.length} rostros`}`, originalName);
        } else {
          emitWorkerStep(fileId, 'faces', 'No se detectaron rostros', originalName);
        }
      } catch (e) {
        console.error(`[Worker] Local face API falló para ${originalName}:`, e);
        emitWorkerStep(fileId, 'faces', 'No se pudieron detectar rostros (error interno)', originalName);
      }

      updateFileReadyStmt.run({ id: fileId });
      console.log(`[Worker] Finalizado con éxito ${originalName}`);
      emitWorkerStep(fileId, 'done', '¡Listo!', originalName);
    }
  } catch (error) {
    console.error(`[Worker] Error crítico procesando ${originalName}`, error);
    db.prepare(`UPDATE files SET status = 'ERROR' WHERE id = ?`).run(fileId);
    emitWorkerStep(fileId, 'done', 'Error de archivo', originalName);
  }
}, { connection: redisConnection as any });

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} falló con ${err.message}`);
});

console.log('[Worker] Escuchando tareas...');
