import { db, absoluteStoragePath, broadcastSSE } from "./server";
import sharp from 'sharp';
import exifr from 'exifr';
import { encode } from 'blurhash';
import path from 'path';
import Database from 'better-sqlite3';
import { pipeline, env } from '@huggingface/transformers';
import { detectFacesInImage } from './faceUtils';
import crypto from 'crypto';

// Configurar paths
const storagePath = process.env.STORAGE_PATH || '../storage';
const absoluteStoragePath = path.resolve(__dirname, '..', storagePath);

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

// ─── Cache in-memory for face descriptors ──────────────────────────
let faceCache: { personId: string; descriptor: number[] }[] | null = null;

function getFaceCache() {
  if (!faceCache) {
    console.log('[Worker] Loading face descriptor cache into memory...');
    const existingFaces = db.prepare(`SELECT personId, descriptor FROM file_faces`).all() as any[];
    faceCache = existingFaces.map(ef => ({
      personId: ef.personId,
      descriptor: JSON.parse(ef.descriptor)
    }));
  }
  return faceCache;
}

// ─── Queries preparadas para actualizar base de datos ───────────────────
let updateFileStmt: any;
let updateFacesStmt: any;

function getStmts() {
  if (!updateFileStmt) {
    updateFileStmt = db.prepare(`
      UPDATE files 
      SET status = ?, 
          thumbnailName = ?,
          width = ?, 
          height = ?, 
          blurhash = ?, 
          embedding = ?, 
          takenAt = ?, 
          latitude = ?, 
          longitude = ?
      WHERE id = ?
    `);
  }
  if (!updateFacesStmt) {
    updateFacesStmt = db.prepare(`UPDATE files SET faces = ? WHERE id = ?`);
  }
  return { updateFileStmt, updateFacesStmt };
}

export async function processImage(jobData: any) {
  const { fileId, savedName, originalName, mimeType, absolutePath } = jobData;
  console.log(`[Worker] Empezando a procesar ${originalName} (${fileId})`);

  try {
    const start = Date.now();
    let filePath = absolutePath || path.join(absoluteStoragePath, savedName);
    let tempJpegPath: string | null = null;
    
    // Convertir HEIC a JPG usando sips nativo de macOS para evitar crashes de libheif
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

    // Solo procesamos imágenes
    if (!mimeType.startsWith('image/')) {
       const { updateFileStmt } = getStmts();
       updateFileStmt.run('READY', null, null, null, null, null, null, null, null, fileId);
       return;
    }

    const image = sharp(filePath, { unlimited: true }).rotate();
    const metadata = await image.metadata();
    
    // Ensure thumbnails directory exists
    const thumbnailsDir = path.join(absoluteStoragePath, 'thumbnails');
    if (!require('fs').existsSync(thumbnailsDir)) {
      require('fs').mkdirSync(thumbnailsDir, { recursive: true });
    }

    // A) Generar miniatura WebP (Max 800px)
    const thumbnailName = `thumbnails/thumb-${savedName}.webp`;
    const thumbnailPath = path.join(absoluteStoragePath, thumbnailName);
    await image.clone()
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(thumbnailPath);

    // A.2) Si es HEIC, generar también una versión web de alta resolución
    if (originalName.toLowerCase().endsWith('.heic')) {
      const webPath = path.join(absoluteStoragePath, `thumbnails/web-${savedName}.webp`);
      await image.clone()
        .resize({ width: 2560, withoutEnlargement: true })
        .webp({ quality: 90 })
        .toFile(webPath);
    }

    // B) Generar BlurHash
    // Ajustamos la imagen a 32x32 manteniendo proporción, con canal alpha asegurado
    const { data: rawData, info: rawInfo } = await image.clone()
      .raw()
      .ensureAlpha()
      .resize(32, 32, { fit: 'inside' })
      .toBuffer({ resolveWithObject: true });
    
    const blurhashStr = encode(new Uint8ClampedArray(rawData), rawInfo.width, rawInfo.height, 4, 4);

    // C) Extraer EXIF
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

    // D) Generar CLIP Embedding (Semantic Search)
    let embeddingStr = null;
    if (visionPipeline) {
      try {
         const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('CLIP Timeout')), 60000));
         const output = await Promise.race([visionPipeline(filePath), timeoutPromise]) as any;
         embeddingStr = JSON.stringify(Array.from(output.data));
      } catch (e) {
         console.error('[Worker] Falló embedding para', originalName);
      }
    }

    // E) Guardar todo en SQLite
    const { updateFileStmt } = getStmts();
    updateFileStmt.run(
      'READY',
      thumbnailName,
      metadata.width,
      metadata.height,
      blurhashStr,
      embeddingStr,
      takenAt,
      latitude,
      longitude,
      fileId
    );

    // F) Extraer rostros enviando al modelo local de node.js
    try {
      console.log(`[Worker] Detectando rostros en miniatura de ${originalName}`);
      const faces = await detectFacesInImage(thumbnailPath);
      
      if (faces && faces.length > 0) {
        // Almacenar info en la base de datos de manera relacional (y agrupar)
        for (const face of faces) {
          const descriptorStr = JSON.stringify(face.descriptor);
          
          // Buscar si el rostro ya pertenece a alguien (Euclidean distance < 0.6)
          const cache = getFaceCache();
          let matchedPersonId = null;
          let minDistance = 0.5; // Sweet spot for face-api.js to balance false positives and false negatives

          for (const ef of cache) {
            let distance = 0;
            for (let i = 0; i < 128; i++) {
              distance += Math.pow(face.descriptor[i] - ef.descriptor[i], 2);
            }
            distance = Math.sqrt(distance);
            
            if (distance < minDistance) {
              minDistance = distance;
              matchedPersonId = ef.personId;
            }
          }

          // Si no hace match, crear una nueva persona anónima
          if (!matchedPersonId) {
            matchedPersonId = crypto.randomUUID();
            db.prepare(`INSERT INTO people (id, name, coverFileId) VALUES (?, ?, ?)`).run(matchedPersonId, 'Desconocido', fileId);
          } else {
            // Actualizar portada si no tiene
            db.prepare(`UPDATE people SET coverFileId = COALESCE(coverFileId, ?) WHERE id = ?`).run(fileId, matchedPersonId);
          }

          // Guardar el rostro detectado
          db.prepare(`
            INSERT INTO file_faces (id, fileId, personId, descriptor, boxX, boxY, boxW, boxH)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            crypto.randomUUID(), fileId, matchedPersonId, descriptorStr, 
            face.box.x, face.box.y, face.box.width, face.box.height
          );
          
          // Actualizar cache con la nueva cara
          cache.push({
            personId: matchedPersonId,
            descriptor: Array.from(face.descriptor)
          });
        }
        
        // Guardar por retrocompatibilidad en 'faces' column
        const { updateFacesStmt } = getStmts();
        updateFacesStmt.run(JSON.stringify(faces.map(f => f.box)), fileId);
      }
    } catch (e: any) {
      console.log(`[Worker] Local face API falló para ${originalName}:`, e);
    }

    console.log(`[Worker] Finalizado con éxito ${originalName}`);

    if (tempJpegPath) {
      try { require('fs').unlinkSync(tempJpegPath); } catch(e) {}
    }
  } catch (error) {
    console.error(`[Worker] Error crítico procesando ${originalName}`, error);
    db.prepare(`UPDATE files SET status = 'ERROR' WHERE id = ?`).run(fileId);
  }
}
