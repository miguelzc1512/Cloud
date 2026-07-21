"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const sharp_1 = __importDefault(require("sharp"));
const exifr_1 = __importDefault(require("exifr"));
const blurhash_1 = require("blurhash");
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const transformers_1 = require("@huggingface/transformers");
const faceUtils_1 = require("./faceUtils");
const crypto_1 = __importDefault(require("crypto"));
require("./docProcessor");
// Configurar paths
const storagePath = process.env.STORAGE_PATH || '../storage';
const absoluteStoragePath = path_1.default.resolve(__dirname, '..', storagePath);
// Configurar Redis
const redisConnection = new ioredis_1.default({ host: process.env.REDIS_HOST || '127.0.0.1', maxRetriesPerRequest: null });
// Configurar SQLite
const STORAGE_PATH = process.env.STORAGE_PATH || path_1.default.resolve(__dirname, '..', '..', 'storage');
const dbPath = path_1.default.resolve(STORAGE_PATH, 'nube.db');
const db = new better_sqlite3_1.default(dbPath);
db.pragma('journal_mode = WAL');
// ─── AI Models (Singleton for the worker) ─────────────────────────────
let visionPipeline = null;
async function initModels() {
    console.log('[Worker] Loading AI Models...');
    try {
        transformers_1.env.localModelPath = './models';
        transformers_1.env.allowRemoteModels = true;
        visionPipeline = await (0, transformers_1.pipeline)('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
        console.log('[Worker] AI Models loaded successfully.');
    }
    catch (e) {
        console.error('[Worker] Error loading models:', e);
    }
}
initModels();
// ─── Queries preparadas para actualizar base de datos ───────────────────
const updateFileStmt = db.prepare(`
  UPDATE files SET
    thumbnailName = @thumbnailName,
    blurhash = @blurhash,
    width = @width,
    height = @height,
    embedding = @embedding,
    takenAt = COALESCE(@takenAt, takenAt),
    latitude = COALESCE(@latitude, latitude),
    longitude = COALESCE(@longitude, longitude),
    status = 'READY'
  WHERE id = @id
`);
const updateFacesStmt = db.prepare(`UPDATE files SET faces = ? WHERE id = ?`);
const worker = new bullmq_1.Worker('image-processing', async (job) => {
    const { fileId, savedName, originalName, mimeType, absolutePath } = job.data;
    console.log(`[Worker] Empezando a procesar ${originalName} (${fileId})`);
    try {
        const start = Date.now();
        let filePath = absolutePath || path_1.default.join(absoluteStoragePath, savedName);
        let tempJpegPath = null;
        // Convertir HEIC a JPG usando sips nativo de macOS para evitar crashes de libheif
        if (originalName.toLowerCase().endsWith('.heic')) {
            try {
                const { execSync } = require('child_process');
                tempJpegPath = path_1.default.join(absoluteStoragePath, `temp_${fileId}.jpg`);
                execSync(`sips -s format jpeg "${filePath}" --out "${tempJpegPath}"`);
                filePath = tempJpegPath;
            }
            catch (e) {
                console.error(`[Worker] Error convirtiendo HEIC a JPG con sips para ${originalName}`, e);
            }
        }
        // Solo procesamos imágenes
        if (!mimeType.startsWith('image/')) {
            updateFileStmt.run({
                id: fileId, thumbnailName: null, blurhash: null, width: null, height: null,
                embedding: null, takenAt: null, latitude: null, longitude: null
            });
            return;
        }
        const image = (0, sharp_1.default)(filePath, { unlimited: true }).rotate();
        const metadata = await image.metadata();
        // Ensure thumbnails directory exists
        const thumbnailsDir = path_1.default.join(absoluteStoragePath, 'thumbnails');
        if (!require('fs').existsSync(thumbnailsDir)) {
            require('fs').mkdirSync(thumbnailsDir, { recursive: true });
        }
        // A) Generar miniatura WebP (Max 800px)
        const thumbnailName = `thumbnails/thumb-${savedName}.webp`;
        const thumbnailPath = path_1.default.join(absoluteStoragePath, thumbnailName);
        await image.clone()
            .resize({ width: 800, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(thumbnailPath);
        // A.2) Si es HEIC, generar también una versión web de alta resolución
        if (originalName.toLowerCase().endsWith('.heic')) {
            const webPath = path_1.default.join(absoluteStoragePath, `thumbnails/web-${savedName}.webp`);
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
        const blurhashStr = (0, blurhash_1.encode)(new Uint8ClampedArray(rawData), rawInfo.width, rawInfo.height, 4, 4);
        // C) Extraer EXIF
        let takenAt = null;
        let latitude = null;
        let longitude = null;
        try {
            const exifData = await exifr_1.default.parse(filePath);
            if (exifData) {
                if (exifData.DateTimeOriginal)
                    takenAt = new Date(exifData.DateTimeOriginal).toISOString();
                if (exifData.latitude !== undefined)
                    latitude = exifData.latitude;
                if (exifData.longitude !== undefined)
                    longitude = exifData.longitude;
            }
        }
        catch (e) { }
        // D) Generar CLIP Embedding (Semantic Search)
        let embeddingStr = null;
        if (visionPipeline) {
            try {
                const output = await visionPipeline(filePath);
                embeddingStr = JSON.stringify(Array.from(output.data));
            }
            catch (e) {
                console.error('[Worker] Falló embedding para', originalName);
            }
        }
        // E) Guardar todo en SQLite
        updateFileStmt.run({
            id: fileId,
            thumbnailName,
            blurhash: blurhashStr,
            width: metadata.width,
            height: metadata.height,
            embedding: embeddingStr,
            takenAt,
            latitude,
            longitude
        });
        // F) Extraer rostros enviando al modelo local de node.js
        try {
            console.log(`[Worker] Detectando rostros en miniatura de ${originalName}`);
            const faces = await (0, faceUtils_1.detectFacesInImage)(thumbnailPath);
            if (faces && faces.length > 0) {
                // Almacenar info en la base de datos de manera relacional (y agrupar)
                for (const face of faces) {
                    const descriptorStr = JSON.stringify(face.descriptor);
                    // Buscar si el rostro ya pertenece a alguien (Euclidean distance < 0.6)
                    const existingFaces = db.prepare(`SELECT id, personId, descriptor FROM file_faces`).all();
                    let matchedPersonId = null;
                    let minDistance = 0.5; // Sweet spot for face-api.js to balance false positives and false negatives
                    for (const ef of existingFaces) {
                        const efDescriptor = JSON.parse(ef.descriptor);
                        let distance = 0;
                        for (let i = 0; i < 128; i++) {
                            distance += Math.pow(face.descriptor[i] - efDescriptor[i], 2);
                        }
                        distance = Math.sqrt(distance);
                        if (distance < minDistance) {
                            minDistance = distance;
                            matchedPersonId = ef.personId;
                        }
                    }
                    // Si no hace match, crear una nueva persona anónima
                    if (!matchedPersonId) {
                        matchedPersonId = crypto_1.default.randomUUID();
                        db.prepare(`INSERT INTO people (id, name, coverFileId) VALUES (?, ?, ?)`).run(matchedPersonId, 'Desconocido', fileId);
                    }
                    else {
                        // Actualizar portada si no tiene
                        db.prepare(`UPDATE people SET coverFileId = COALESCE(coverFileId, ?) WHERE id = ?`).run(fileId, matchedPersonId);
                    }
                    // Guardar el rostro detectado
                    db.prepare(`
            INSERT INTO file_faces (id, fileId, personId, descriptor, boxX, boxY, boxW, boxH)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(crypto_1.default.randomUUID(), fileId, matchedPersonId, descriptorStr, face.box.x, face.box.y, face.box.width, face.box.height);
                }
                // Guardar por retrocompatibilidad en 'faces' column
                updateFacesStmt.run(JSON.stringify(faces.map(f => f.box)), fileId);
            }
        }
        catch (e) {
            console.log(`[Worker] Local face API falló para ${originalName}:`, e);
        }
        console.log(`[Worker] Finalizado con éxito ${originalName}`);
        if (tempJpegPath) {
            try {
                require('fs').unlinkSync(tempJpegPath);
            }
            catch (e) { }
        }
    }
    catch (error) {
        console.error(`[Worker] Error crítico procesando ${originalName}`, error);
        db.prepare(`UPDATE files SET status = 'ERROR' WHERE id = ?`).run(fileId);
    }
}, { connection: redisConnection });
worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} falló con ${err.message}`);
});
console.log('[Worker] Escuchando tareas...');
