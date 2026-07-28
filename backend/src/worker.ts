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

async function startBackfillEmbeddings() {
  setTimeout(async () => {
    try {
      const missing = db.prepare(`
        SELECT id, originalName, thumbnailName
        FROM files
        WHERE isDeleted = 0 AND thumbnailName IS NOT NULL AND embedding IS NULL
      `).all() as any[];

      if (missing.length === 0) return;
      console.log(`[Worker Backfill] Iniciando generación de embeddings para ${missing.length} archivos pendientes...`);

      const stmt = db.prepare(`UPDATE files SET embedding = @embedding WHERE id = @id`);
      let processed = 0;
      for (const f of missing) {
        if (!visionPipeline) break;
        try {
          const thumbPath = path.join(absoluteStoragePath, f.thumbnailName);
          if (fs.existsSync(thumbPath)) {
            const output = await visionPipeline(thumbPath);
            if (output && output.data) {
              const embeddingStr = JSON.stringify(Array.from(output.data));
              stmt.run({ id: f.id, embedding: embeddingStr });
              processed++;
              if (processed % 100 === 0 || processed === missing.length) {
                console.log(`[Worker Backfill] Progreso: ${processed}/${missing.length} embeddings procesados.`);
              }
            }
          }
        } catch (e: any) {
          // Continuar con el siguiente si falla uno
        }
        await new Promise(r => setTimeout(r, 10));
      }
      console.log(`[Worker Backfill] Finalizado. ${processed} embeddings generados con éxito.`);
    } catch (err: any) {
      console.error('[Worker Backfill] Error en proceso de backfill:', err.message);
    }
  }, 5000);
}

async function initModels() {
  console.log('[Worker] Loading AI Models...');
  try {
    env.localModelPath = './models';
    env.allowRemoteModels = true;
    visionPipeline = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
    console.log('[Worker] AI Models loaded successfully.');
    startBackfillEmbeddings();
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
        let takenAt = null;
        let latitude = null;
        let longitude = null;
        try {
          const exifData = await exifr.parse(filePath);
          if (exifData) {
            if (exifData.DateTimeOriginal) takenAt = new Date(exifData.DateTimeOriginal).toISOString();
            else if (exifData.CreateDate) takenAt = new Date(exifData.CreateDate).toISOString();
            if (exifData.latitude !== undefined) latitude = exifData.latitude;
            if (exifData.longitude !== undefined) longitude = exifData.longitude;
          }
        } catch(e) {}

        if (originalName.toLowerCase().endsWith('.heic') || mimeType === 'image/heic') {
          try {
            emitWorkerStep(fileId, 'thumbnail', 'Convirtiendo HEIC a JPG...', originalName, contentType);
            const inputBuf = fs.readFileSync(filePath);
            let outputBuf: Buffer;
            const isAlreadyJpeg = inputBuf[0] === 0xFF && inputBuf[1] === 0xD8;

            if (isAlreadyJpeg) {
              outputBuf = inputBuf;
            } else {
              try {
                const heicConvert = require('heic-convert');
                outputBuf = await heicConvert({ buffer: inputBuf, format: 'JPEG', quality: 0.92 });
              } catch (heicErr: any) {
                console.warn(`[Worker] heic-convert no pudo procesar ${originalName}, intentando con Sharp:`, heicErr.message);
                outputBuf = await sharp(inputBuf).jpeg({ quality: 92 }).toBuffer();
              }
            }

            // Guardar la versión JPG en la carpeta dedicada HEIC_Convertidas dentro del SSD
            const parentDir = path.dirname(filePath);
            const baseName = path.parse(filePath).name;

            let dedicatedBaseDir: string;
            if (filePath.includes('/host_e/Fotos') || filePath.toLowerCase().includes('e:/fotos') || filePath.toLowerCase().includes('e:\\fotos')) {
              dedicatedBaseDir = filePath.includes('/host_e') ? '/host_e/Fotos/HEIC_Convertidas' : 'E:\\Fotos\\HEIC_Convertidas';
            } else if (filePath.startsWith('/host_e')) {
              dedicatedBaseDir = '/host_e/HEIC_Convertidas';
            } else {
              dedicatedBaseDir = path.join(absoluteStoragePath, 'HEIC_Convertidas');
            }

            let relFolder = '';
            if (filePath.startsWith('/host_e')) {
              const relFromHost = path.relative('/host_e', parentDir);
              if (relFromHost.startsWith('Fotos/') || relFromHost.startsWith('Fotos\\')) {
                relFolder = relFromHost.substring(6);
              } else if (relFromHost === 'Fotos') {
                relFolder = '';
              } else {
                relFolder = relFromHost;
              }
            } else if (filePath.match(/^[a-zA-Z]:/)) {
              const driveRoot = filePath.slice(0, 3);
              const relFromDrive = path.relative(path.join(driveRoot, 'Fotos'), parentDir);
              relFolder = relFromDrive;
            }

            const targetJpgDir = relFolder ? path.join(dedicatedBaseDir, relFolder) : dedicatedBaseDir;
            if (!fs.existsSync(targetJpgDir)) {
              fs.mkdirSync(targetJpgDir, { recursive: true });
            }

            const targetJpgPath = path.join(targetJpgDir, `${baseName}.jpg`);
            fs.writeFileSync(targetJpgPath, outputBuf);
            console.log(`[Worker] HEIC convertido guardado en SSD dedicado: ${targetJpgPath}`);

            let targetJpgSavedName = targetJpgPath;
            
            db.prepare(`UPDATE files SET savedName = ?, mimeType = 'image/jpeg', absolutePath = ? WHERE id = ?`)
              .run(targetJpgSavedName, targetJpgPath, fileId);

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

      emitWorkerStep(fileId, 'embedding', 'Analizando contenido con IA...', originalName, contentType);
      let embeddingStr = null;
      if (visionPipeline) {
        try {
          const fileRec = db.prepare('SELECT thumbnailName, savedName FROM files WHERE id = ?').get(fileId) as any;
          let targetImagePath: string | null = null;

          if (fileRec?.thumbnailName) {
            const thumbPath = path.join(absoluteStoragePath, fileRec.thumbnailName);
            if (fs.existsSync(thumbPath)) targetImagePath = thumbPath;
          }

          if (!targetImagePath) {
            if (filePath && fs.existsSync(filePath)) {
              targetImagePath = filePath;
            } else if (fileRec?.savedName) {
              const savedPath = path.join(absoluteStoragePath, fileRec.savedName);
              if (fs.existsSync(savedPath)) targetImagePath = savedPath;
            }
          }

          if (targetImagePath) {
            const output = await visionPipeline(targetImagePath);
            if (output && output.data) {
              embeddingStr = JSON.stringify(Array.from(output.data));
            }
          }
        } catch (e: any) {
          console.error(`[Worker] Falló embedding para ${originalName}:`, e?.message || e);
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
  concurrency: activeConcurrency,
  lockDuration: 120000,
  stalledInterval: 30000
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} falló con ${err.message}`);
});

console.log(`[Worker] Escuchando tareas con concurrencia ${activeConcurrency} (Detectados ${cpuCores} núcleos de CPU)...`);
