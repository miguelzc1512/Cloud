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
function emitWorkerStep(fileId: string, step: string, label: string, originalName?: string, contentType: string = 'gallery', retries = 3) {
  const body = JSON.stringify({ fileId, step, label, originalName, contentType });
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
      setTimeout(() => emitWorkerStep(fileId, step, label, originalName, contentType, retries - 1), 500);
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
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 10000');
db.pragma('temp_store = MEMORY');

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

const cpuCores = require('os').cpus().length || 8;
const envConcurrency = Number(process.env.WORKER_CONCURRENCY);
const activeConcurrency = !isNaN(envConcurrency) && envConcurrency > 0 ? envConcurrency : 16;

sharp.concurrency(0);

const worker = new Worker('image-processing', async job => {
  const { fileId, savedName, originalName, mimeType, absolutePath, contentType } = job.data;
  const start = Date.now();
  let filePath = (absolutePath && fs.existsSync(absolutePath)) ? absolutePath : path.join(absoluteStoragePath, savedName);
  let tempJpegPath: string | null = null;
  const thumbnailName = `thumbnails/thumb-${savedName}.webp`;
  const thumbnailPath = path.join(absoluteStoragePath, thumbnailName);

  try {
    if (!mimeType.startsWith('image/')) {
       let generatedThumb: string | null = null;
       let videoBlurhash: string | null = null;
       let videoWidth: number | null = null;
       let videoHeight: number | null = null;

       if (mimeType.startsWith('video/')) {
         try {
           const ffmpegPath = require('ffmpeg-static');
           const { exec } = require('child_process');
           const util = require('util');
           const execAsync = util.promisify(exec);
           const thumbnailsDir = path.join(absoluteStoragePath, 'thumbnails');
           if (!fs.existsSync(thumbnailsDir)) fs.mkdirSync(thumbnailsDir, { recursive: true });
           
           await execAsync(`"${ffmpegPath}" -y -i "${filePath}" -ss 00:00:01 -vframes 1 "${thumbnailPath}"`);
           if (fs.existsSync(thumbnailPath)) {
             generatedThumb = thumbnailName;
             try {
               const vImage = sharp(thumbnailPath);
               const vMeta = await vImage.metadata();
               videoWidth = vMeta.width || null;
               videoHeight = vMeta.height || null;

               const { data: vRaw, info: vInfo } = await vImage.clone()
                 .raw()
                 .ensureAlpha()
                 .resize(32, 32, { fit: 'inside' })
                 .toBuffer({ resolveWithObject: true });
               videoBlurhash = encode(new Uint8ClampedArray(vRaw), vInfo.width, vInfo.height, 4, 4);
             } catch (vErr) {
               console.error(`[Worker] Error calculando blurhash de video para ${originalName}`, vErr);
             }
           }
         } catch (vidErr: any) {
           console.error(`[Worker] Error generando miniatura de video para ${originalName}:`, vidErr.message);
         }
       }

       updateFileThumbnailStmt.run({
           id: fileId, thumbnailName: generatedThumb, blurhash: videoBlurhash, width: videoWidth, height: videoHeight, 
           takenAt: null, latitude: null, longitude: null
       });
       updateFileEmbeddingStmt.run({ id: fileId, embedding: null });
       updateFileReadyStmt.run({ id: fileId });
       emitWorkerStep(fileId, 'thumbnail_done', 'Miniatura de video lista', originalName, contentType);
       emitWorkerStep(fileId, 'embedding_done', 'Omitido para video', originalName, contentType);
       emitWorkerStep(fileId, 'faces_done', 'Omitido para video', originalName, contentType);
       emitWorkerStep(fileId, 'done', '¡Listo!', originalName, contentType);
       return;
    }

    if (job.name === 'generate-thumbnail') {
      console.log(`[Worker] Empezando a procesar miniatura ${originalName} (${fileId})`);
      
      try {
        if (originalName.toLowerCase().endsWith('.heic') || mimeType === 'image/heic') {
          try {
            emitWorkerStep(fileId, 'thumbnail', 'Convirtiendo HEIC a JPG...', originalName, contentType);
            const heicConvert = require('heic-convert');
            const inputBuf = fs.readFileSync(filePath);
            const outputBuf = await heicConvert({ buffer: inputBuf, format: 'JPEG', quality: 0.90 });
            
            // Si el archivo está guardado dentro del storage (es una subida directa o sync), reemplazamos el HEIC por el JPG
            const fotosDir = path.join(absoluteStoragePath, 'fotos');
            const targetJpgName = `${fileId}.jpg`;
            const targetJpgPath = path.join(fotosDir, targetJpgName);
            
            fs.writeFileSync(targetJpgPath, outputBuf);
            
            // Si existía un archivo HEIC viejo en storage, lo eliminamos para no duplicar espacio
            if (fs.existsSync(filePath) && filePath !== targetJpgPath && filePath.includes(absoluteStoragePath)) {
              try { fs.unlinkSync(filePath); } catch(e) {}
            }
            
            // Actualizar la base de datos con el nuevo nombre de archivo JPG
            db.prepare(`UPDATE files SET savedName = ?, mimeType = 'image/jpeg' WHERE id = ?`).run(targetJpgName, fileId);
            filePath = targetJpgPath;
          } catch (e: any) {
            console.error(`[Worker] Error convirtiendo HEIC para ${originalName}:`, e.message);
          }
        }

        const image = sharp(filePath, { unlimited: true }).rotate();
        const metadata = await image.metadata();
        
        const thumbnailsDir = path.join(absoluteStoragePath, 'thumbnails');
        if (!fs.existsSync(thumbnailsDir)) {
          fs.mkdirSync(thumbnailsDir, { recursive: true });
        }

        emitWorkerStep(fileId, 'thumbnail', 'Creando miniatura...', originalName, contentType);
        await image.clone()
          .resize({ width: 800, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(thumbnailPath);

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
        emitWorkerStep(fileId, 'thumbnail_done', 'Miniatura lista', originalName, contentType);
      } catch (imgErr: any) {
        console.error(`[Worker] Error procesando miniatura ${originalName}:`, imgErr.message);
        emitWorkerStep(fileId, 'thumbnail_done', 'Error de formato', originalName, contentType);
        emitWorkerStep(fileId, 'embedding_done', 'Omitido', originalName, contentType);
        emitWorkerStep(fileId, 'faces_done', 'Omitido', originalName, contentType);
        emitWorkerStep(fileId, 'done', 'Error de formato', originalName, contentType);
      }

    } else if (job.name === 'generate-embedding') {
      console.log(`[Worker] Generando embedding para ${originalName} (${fileId})`);
      
      if (originalName.toLowerCase().endsWith('.heic') || mimeType === 'image/heic') {
        const convertedJpg = path.join(absoluteStoragePath, 'fotos', `${fileId}.jpg`);
        if (fs.existsSync(convertedJpg)) {
          filePath = convertedJpg;
        }
      }

      emitWorkerStep(fileId, 'embedding', 'Analizando contenido con IA...', originalName, contentType);
      let embeddingStr = null;
      if (visionPipeline) {
        try {
           const clipBuffer = await sharp(filePath)
             .resize(224, 224, { fit: 'cover' })
             .toBuffer();
           const output = await visionPipeline(clipBuffer);
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
      emitWorkerStep(fileId, 'embedding_done', 'Embedding listo', originalName, contentType);

    } else if (job.name === 'detect-faces') {
      console.log(`[Worker] Detectando rostros en ${originalName} (${fileId})`);
      emitWorkerStep(fileId, 'faces', 'Detectando rostros...', originalName, contentType);
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
          emitWorkerStep(fileId, 'faces', `Se ${faces.length === 1 ? 'encontró 1 rostro' : `encontraron ${faces.length} rostros`}`, originalName, contentType);
        } else {
          emitWorkerStep(fileId, 'faces', 'No se detectaron rostros', originalName, contentType);
        }
      } catch (e) {
        console.error(`[Worker] Local face API falló para ${originalName}:`, e);
        emitWorkerStep(fileId, 'faces', 'No se pudieron detectar rostros (error interno)', originalName, contentType);
      }

      updateFileReadyStmt.run({ id: fileId });
      console.log(`[Worker] Finalizado con éxito ${originalName}`);
      emitWorkerStep(fileId, 'faces_done', 'Rostros analizados', originalName, contentType);
      emitWorkerStep(fileId, 'done', '¡Listo!', originalName, contentType);
    }
  } catch (error) {
    console.error(`[Worker] Error crítico procesando ${originalName}`, error);
    db.prepare(`UPDATE files SET status = 'ERROR' WHERE id = ?`).run(fileId);
    emitWorkerStep(fileId, 'done', 'Error de archivo', originalName);
  }
}, { 
  connection: redisConnection as any,
  concurrency: activeConcurrency
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} falló con ${err.message}`);
});

console.log(`[Worker] Escuchando tareas con concurrencia ${activeConcurrency} (Detectados ${cpuCores} núcleos de CPU)...`);
