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
// Configurar paths
const storagePath = process.env.STORAGE_PATH || '../storage';
const absoluteStoragePath = path_1.default.resolve(__dirname, '..', storagePath);
// Configurar Redis
const redisConnection = new ioredis_1.default({ maxRetriesPerRequest: null });
// Configurar SQLite
const dbPath = path_1.default.resolve(__dirname, '..', 'nube.db');
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
    const { fileId, savedName, originalName, mimeType } = job.data;
    console.log(`[Worker] Empezando a procesar ${originalName} (${fileId})`);
    try {
        let filePath = path_1.default.join(absoluteStoragePath, savedName);
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
        // A) Generar miniatura WebP (Max 800px)
        const thumbnailName = `thumb-${savedName}.webp`;
        const thumbnailPath = path_1.default.join(absoluteStoragePath, thumbnailName);
        await image.clone()
            .resize({ width: 800, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(thumbnailPath);
        // A.2) Si es HEIC, generar también una versión web de alta resolución
        if (originalName.toLowerCase().endsWith('.heic')) {
            const webPath = path_1.default.join(absoluteStoragePath, `web-${savedName}.webp`);
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
        // F) Extraer rostros enviando a Python API (asíncrono con await, dentro del worker)
        try {
            const pyRes = await fetch('http://localhost:8000/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imagePath: filePath }),
                signal: AbortSignal.timeout(60000)
            });
            if (pyRes.ok) {
                const data = await pyRes.json();
                if (data.faces && data.faces.length > 0) {
                    updateFacesStmt.run(JSON.stringify(data.faces), fileId);
                }
            }
        }
        catch (e) {
            console.log(`[Worker] Python face API falló o no disponible para ${originalName}`);
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
