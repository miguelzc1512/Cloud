"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stmts = exports.docDb = exports.db = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const translate_1 = __importDefault(require("translate"));
const multer_1 = __importDefault(require("multer"));
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const sharp_1 = __importDefault(require("sharp"));
const archiver = require('archiver');
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
const storagePath = process.env.STORAGE_PATH || '../storage';
// Ensure storage directory exists
const absoluteStoragePath = path_1.default.resolve(__dirname, '..', storagePath);
if (!fs_1.default.existsSync(absoluteStoragePath)) {
    fs_1.default.mkdirSync(absoluteStoragePath, { recursive: true });
}
// ─── SQLite Database Setup ─────────────────────────────────────────────────
const STORAGE_PATH = process.env.STORAGE_PATH || path_1.default.resolve(__dirname, '..', '..', 'storage');
const dbPath = path_1.default.resolve(STORAGE_PATH, 'nube.db');
exports.db = new better_sqlite3_1.default(dbPath);
// Enable WAL mode for better concurrent read performance
exports.db.pragma('journal_mode = WAL');
exports.db.pragma('busy_timeout = 5000');
exports.db.pragma('foreign_keys = ON');
// Create tables
const docDbPath = path_1.default.resolve(STORAGE_PATH, 'documents.db');
exports.docDb = new better_sqlite3_1.default(docDbPath);
exports.docDb.pragma('journal_mode = WAL');
exports.docDb.pragma('busy_timeout = 5000');
exports.docDb.pragma('foreign_keys = ON');
exports.docDb.exec(`
  CREATE TABLE IF NOT EXISTS doc_clusters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS docs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    savedName TEXT NOT NULL UNIQUE,
    extension TEXT NOT NULL,
    mimeType TEXT NOT NULL,
    size INTEGER NOT NULL,
    absolutePath TEXT,
    clusterId TEXT,
    status TEXT DEFAULT 'PROCESSING',
    createdAt TEXT NOT NULL,
    FOREIGN KEY (clusterId) REFERENCES doc_clusters(id) ON DELETE SET NULL
  );
`);
try {
    exports.docDb.exec(`ALTER TABLE doc_clusters ADD COLUMN parentId TEXT REFERENCES doc_clusters(id) ON DELETE CASCADE`);
}
catch (e) {
    // Column might already exist, ignore
}
exports.db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    originalName TEXT NOT NULL,
    savedName TEXT NOT NULL UNIQUE,
    thumbnailName TEXT,
    mimeType TEXT NOT NULL,
    size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    blurhash TEXT,
    status TEXT DEFAULT 'PROCESSING',
    embedding TEXT,
    createdAt TEXT NOT NULL,
    takenAt TEXT,
    latitude REAL,
    longitude REAL,
    isDeleted INTEGER NOT NULL DEFAULT 0,
    deletedAt TEXT,
    faces TEXT,
    isFavorite INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    coverUrl TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS album_files (
    albumId TEXT NOT NULL,
    fileId TEXT NOT NULL,
    PRIMARY KEY (albumId, fileId),
    FOREIGN KEY (albumId) REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY (fileId) REFERENCES files(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    coverFileId TEXT,
    isHidden INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS file_faces (
    id TEXT PRIMARY KEY,
    fileId TEXT NOT NULL,
    personId TEXT NOT NULL,
    descriptor TEXT,
    boxX REAL,
    boxY REAL,
    boxW REAL,
    boxH REAL,
    FOREIGN KEY (fileId) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (personId) REFERENCES people(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS album_people (
    albumId TEXT NOT NULL,
    personId TEXT NOT NULL,
    PRIMARY KEY (albumId, personId),
    FOREIGN KEY (albumId) REFERENCES albums(id) ON DELETE CASCADE
  );
`);
try {
    exports.db.exec(`ALTER TABLE files ADD COLUMN uploadSource TEXT;`);
}
catch (e) { }
try {
    exports.db.exec(`ALTER TABLE files ADD COLUMN absolutePath TEXT;`);
}
catch (e) { }
try {
    exports.db.exec(`ALTER TABLE files ADD COLUMN isFavorite INTEGER DEFAULT 0;`);
}
catch (e) { }
try {
    exports.db.exec(`ALTER TABLE file_faces ADD COLUMN id TEXT;`);
}
catch (e) { }
try {
    exports.db.exec(`ALTER TABLE file_faces ADD COLUMN descriptor TEXT;`);
}
catch (e) { }
// ─── Prepared Statements (compiled once, fast always) ──────────────────────
exports.stmts = {
    insertFile: exports.db.prepare(`
    INSERT INTO files (id, originalName, savedName, mimeType, size, status, createdAt, isDeleted, uploadSource, absolutePath)
    VALUES (@id, @originalName, @savedName, @mimeType, @size, 'PROCESSING', @createdAt, 0, @uploadSource, @absolutePath)
  `),
    getFiles: exports.db.prepare(`
    SELECT id, originalName, savedName, thumbnailName, blurhash, width, height, status, mimeType, size, createdAt, takenAt, latitude, longitude, uploadSource, isFavorite, absolutePath
    FROM files WHERE isDeleted = 0 ORDER BY COALESCE(takenAt, createdAt) DESC
  `),
    getFilesWithEmbedding: exports.db.prepare(`
    SELECT id, originalName, savedName, thumbnailName, blurhash, mimeType, size, createdAt, takenAt, latitude, longitude, embedding, uploadSource, absolutePath
    FROM files WHERE isDeleted = 0 AND embedding IS NOT NULL
  `),
    softDelete: exports.db.prepare(`UPDATE files SET isDeleted = 1, deletedAt = ? WHERE id = ? AND isDeleted = 0`),
    getTrash: exports.db.prepare(`
    SELECT id, originalName, savedName, thumbnailName, blurhash, mimeType, size, createdAt, takenAt, latitude, longitude, isDeleted, deletedAt, uploadSource, isFavorite, absolutePath
    FROM files WHERE isDeleted = 1 ORDER BY COALESCE(takenAt, createdAt) DESC
  `),
    restore: exports.db.prepare(`UPDATE files SET isDeleted = 0, deletedAt = NULL WHERE id = ? AND isDeleted = 1`),
    getFileById: exports.db.prepare(`SELECT * FROM files WHERE id = ?`),
    hardDelete: exports.db.prepare(`DELETE FROM files WHERE id = ? AND isDeleted = 1`),
    updateFaces: exports.db.prepare(`UPDATE files SET faces = ? WHERE id = ?`),
    toggleFavorite: exports.db.prepare(`UPDATE files SET isFavorite = NOT isFavorite WHERE id = ?`),
    insertAlbum: exports.db.prepare(`INSERT INTO albums (id, name, description, coverUrl, createdAt) VALUES (@id, @name, @description, @coverUrl, @createdAt)`),
    getAlbums: exports.db.prepare(`SELECT * FROM albums ORDER BY createdAt DESC`),
    getAlbumFiles: exports.db.prepare(`
    SELECT f.* FROM files f JOIN album_files af ON f.id = af.fileId WHERE af.albumId = ? AND f.isDeleted = 0
    UNION
    SELECT f.* FROM files f 
    WHERE f.isDeleted = 0 
    AND (SELECT COUNT(personId) FROM album_people WHERE albumId = ?) > 0
    AND (
        SELECT COUNT(DISTINCT ap.personId) 
        FROM album_people ap 
        JOIN file_faces ff ON ap.personId = ff.personId 
        WHERE ap.albumId = ? AND ff.fileId = f.id
    ) = (
        SELECT COUNT(personId) FROM album_people WHERE albumId = ?
    )
  `),
    addFileToAlbum: exports.db.prepare(`INSERT OR IGNORE INTO album_files (albumId, fileId) VALUES (?, ?)`),
    addPersonToAlbum: exports.db.prepare(`INSERT OR IGNORE INTO album_people (albumId, personId) VALUES (?, ?)`),
    removeFileFromAlbum: exports.db.prepare(`DELETE FROM album_files WHERE albumId = ? AND fileId = ?`),
    updateAlbumName: exports.db.prepare(`UPDATE albums SET name = ? WHERE id = ?`),
    deleteAlbum: exports.db.prepare(`DELETE FROM albums WHERE id = ?`),
    getAlbumById: exports.db.prepare(`SELECT * FROM albums WHERE id = ?`),
    getAlbumPeople: exports.db.prepare(`SELECT personId FROM album_people WHERE albumId = ?`),
    deleteAlbumPeople: exports.db.prepare(`DELETE FROM album_people WHERE albumId = ?`),
};
// ─── Express Middleware ────────────────────────────────────────────────────
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/uploads', express_1.default.static(absoluteStoragePath));
app.use('/public', express_1.default.static(path_1.default.resolve(__dirname, '..', 'public')));
const multerStorage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, absoluteStoragePath),
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = (0, multer_1.default)({ storage: multerStorage });
// ─── Cosine Similarity for Semantic Search ────────────────────────────────
function cosineSimilarity(vecA, vecB) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0)
        return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
// ─── AI Models ────────────────────────────────────────────────────────────
let visionPipeline = null;
let tokenizer;
let textModel;
async function initModels() {
    console.log('Loading AI Models (this may take a while on first run)...');
    try {
        const { pipeline, env, AutoTokenizer, CLIPTextModelWithProjection } = await Promise.resolve().then(() => __importStar(require('@huggingface/transformers')));
        env.localModelPath = './models';
        env.allowRemoteModels = true;
        tokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch32');
        textModel = await CLIPTextModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch32');
        visionPipeline = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
        console.log('AI Models loaded successfully.');
    }
    catch (e) {
        console.error('Error loading models:', e);
    }
}
initModels();
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
// Configurar Redis y Queue
const redisConnection = new ioredis_1.default({ host: process.env.REDIS_HOST || '127.0.0.1', maxRetriesPerRequest: null });
const imageQueue = new bullmq_1.Queue('image-processing', { connection: redisConnection });
const imageQueueEvents = new bullmq_1.QueueEvents('image-processing', { connection: redisConnection });
const docQueue = new bullmq_1.Queue('doc-processing', { connection: redisConnection });
// ─── Server-Sent Events (SSE) ─────────────────────────────────────────────
const sseClients = new Set();
function broadcastSSE(event, data) {
    sseClients.forEach(client => {
        client.write(`event: ${event}\n`);
        client.write(`data: ${JSON.stringify(data)}\n\n`);
    });
}
imageQueueEvents.on('completed', ({ jobId, returnvalue }) => {
    broadcastSSE('photo_ready', { jobId });
});
// ─── Routes ───────────────────────────────────────────────────────────────
app.get('/api/download/zip', (req, res) => {
    const idsParam = req.query.ids;
    if (!idsParam) {
        res.status(400).json({ error: 'Missing ids parameter' });
        return;
    }
    const ids = idsParam.split(',');
    if (ids.length === 0) {
        res.status(400).json({ error: 'No ids provided' });
        return;
    }
    const validFiles = [];
    ids.forEach(id => {
        if (!id.trim())
            return;
        let file = exports.stmts.getFileById.get(id);
        if (!file) {
            file = exports.docDb.prepare(`SELECT * FROM docs WHERE id = ?`).get(id);
        }
        if (file) {
            const filePath = file.absolutePath || path_1.default.join(absoluteStoragePath, file.savedName);
            if (fs_1.default.existsSync(filePath)) {
                validFiles.push({ filePath, name: file.originalName || file.name || file.savedName });
            }
        }
    });
    if (validFiles.length === 0) {
        res.status(404).json({ error: 'No valid files found on disk' });
        return;
    }
    if (validFiles.length === 1) {
        const singleFile = validFiles[0];
        res.download(singleFile.filePath, singleFile.name);
        return;
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=nube_download_${Date.now()}.zip`);
    try {
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });
        archive.on('error', (err) => {
            console.error('Archive error:', err);
            if (!res.headersSent) {
                res.status(500).send({ error: err.message });
            }
        });
        archive.pipe(res);
        validFiles.forEach(f => {
            archive.file(f.filePath, { name: f.name });
        });
        archive.finalize();
    }
    catch (err) {
        console.error('ZIP setup error:', err);
        if (!res.headersSent) {
            res.status(500).send({ error: err.message });
        }
    }
});
// GET /api/media/:id/:type
app.get('/api/media/:id/:type', (req, res) => {
    const { id, type } = req.params;
    try {
        const file = exports.stmts.getFileById.get(id);
        if (!file) {
            res.status(404).json({ error: 'File not found' });
            return;
        }
        if (type === 'original') {
            const filePath = file.absolutePath || path_1.default.join(absoluteStoragePath, file.savedName);
            if (fs_1.default.existsSync(filePath)) {
                res.sendFile(filePath);
            }
            else {
                res.status(404).json({ error: 'Original file missing on disk' });
            }
        }
        else if (type === 'thumbnail') {
            const thumbName = file.thumbnailName || file.savedName;
            const thumbPath = path_1.default.join(absoluteStoragePath, thumbName);
            if (fs_1.default.existsSync(thumbPath)) {
                res.sendFile(thumbPath);
            }
            else if (file.absolutePath && fs_1.default.existsSync(file.absolutePath)) {
                res.sendFile(file.absolutePath); // Fallback to original if thumb is missing
            }
            else {
                res.sendFile(path_1.default.join(absoluteStoragePath, file.savedName)); // Fallback to savedName
            }
        }
        else if (type === 'web') {
            if (file.mimeType?.startsWith('video/')) {
                const webPath = path_1.default.join(absoluteStoragePath, `thumbnails/web-${file.savedName}.webm`);
                if (fs_1.default.existsSync(webPath)) {
                    res.sendFile(webPath);
                    return;
                }
            }
            else if (file.mimeType?.startsWith('image/heic') || file.mimeType?.startsWith('image/heif')) {
                const webPath = path_1.default.join(absoluteStoragePath, `thumbnails/web-${file.savedName}.webp`);
                if (fs_1.default.existsSync(webPath)) {
                    res.sendFile(webPath);
                    return;
                }
            }
            // Fallback to original
            const filePath = file.absolutePath || path_1.default.join(absoluteStoragePath, file.savedName);
            if (fs_1.default.existsSync(filePath))
                res.sendFile(filePath);
            else
                res.status(404).json({ error: 'Web file missing' });
        }
        else {
            res.status(400).json({ error: 'Invalid type' });
        }
    }
    catch (error) {
        console.error('Media endpoint error:', error);
        res.status(500).json({ error: 'Failed to serve media' });
    }
});
const settingsPath = path_1.default.join(absoluteStoragePath, 'settings.json');
let currentSettings = { powerMode: 'eco' };
if (fs_1.default.existsSync(settingsPath)) {
    try {
        currentSettings = JSON.parse(fs_1.default.readFileSync(settingsPath, 'utf8'));
    }
    catch (e) { }
}
app.get('/api/config', (req, res) => res.json(currentSettings));
app.post('/api/config/power-mode', (req, res) => {
    const { mode } = req.body;
    if (mode === 'eco' || mode === 'max') {
        currentSettings.powerMode = mode;
        fs_1.default.writeFileSync(settingsPath, JSON.stringify(currentSettings));
        broadcastSSE('powerModeChanged', { mode });
    }
    res.json({ success: true, mode: currentSettings.powerMode });
});
// GET /api/stream (SSE)
app.get('/api/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
});
// Función para crear/buscar la estructura de carpetas en una transacción
const resolveFoldersTransaction = exports.docDb.transaction((relativePath, targetFolderId) => {
    if (!relativePath)
        return targetFolderId;
    const parts = relativePath.split('/');
    if (parts.length <= 1)
        return targetFolderId;
    const folderNames = parts.slice(0, parts.length - 1);
    let currentParentId = targetFolderId;
    const getFolderNull = exports.docDb.prepare(`SELECT id FROM doc_clusters WHERE name = ? AND parentId IS NULL`);
    const getFolderNotNull = exports.docDb.prepare(`SELECT id FROM doc_clusters WHERE name = ? AND parentId = ?`);
    const createFolder = exports.docDb.prepare(`INSERT INTO doc_clusters (id, name, parentId, createdAt) VALUES (?, ?, ?, ?)`);
    for (const folderName of folderNames) {
        let row = currentParentId === null
            ? getFolderNull.get(folderName)
            : getFolderNotNull.get(folderName, currentParentId);
        if (row) {
            currentParentId = row.id;
        }
        else {
            const newId = 'f-' + Date.now().toString() + Math.random().toString(36).slice(2, 6);
            createFolder.run(newId, folderName, currentParentId, new Date().toISOString());
            currentParentId = newId;
        }
    }
    return currentParentId;
});
// POST /api/upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        const relativePath = req.body.relativePath || null;
        const targetFolderId = req.body.targetFolderId === 'null' ? null : (req.body.targetFolderId || null);
        const sourceTab = req.body.sourceTab || null;
        let finalClusterId = targetFolderId;
        if (relativePath) {
            finalClusterId = resolveFoldersTransaction(relativePath, targetFolderId);
        }
        let uploadSource = 'Navegador Web';
        const ua = req.headers['user-agent'] || '';
        if (/Mac OS X/.test(ua))
            uploadSource = 'macOS';
        else if (/Windows/.test(ua))
            uploadSource = 'Windows';
        else if (/iPhone|iPad/.test(ua))
            uploadSource = 'iOS';
        else if (/Android/.test(ua))
            uploadSource = 'Android';
        else if (/Linux/.test(ua))
            uploadSource = 'Linux';
        const fileMeta = {
            id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7),
            originalName: req.file.originalname,
            savedName: req.file.filename,
            mimeType: req.file.mimetype,
            size: req.file.size,
            createdAt: new Date().toISOString(),
            uploadSource,
            absolutePath: null
        };
        const isMedia = req.file.mimetype.startsWith('image/') || req.file.mimetype.startsWith('video/');
        if (isMedia) {
            // 1. Guardar registro inicial en la DB rápida
            exports.stmts.insertFile.run(fileMeta);
            // Notificar al frontend que empezó la importación
            broadcastSSE('upload_started', { id: fileMeta.id, originalName: fileMeta.originalName });
            // 2. Encolar trabajo de procesamiento asíncrono
            try {
                await imageQueue.add('process-image', {
                    fileId: fileMeta.id,
                    savedName: fileMeta.savedName,
                    originalName: fileMeta.originalName,
                    mimeType: fileMeta.mimeType,
                    absolutePath: null
                });
            }
            catch (err) {
                console.error('Redis Queue Error (imageQueue):', err);
                // Fallback or just continue (it will show as processing forever, or we could delete it)
                // We'll throw to the outer catch block to reject the upload
                exports.stmts.hardDelete.run(fileMeta.id);
                if (req.file && req.file.path && fs_1.default.existsSync(req.file.path))
                    fs_1.default.unlinkSync(req.file.path);
                res.status(503).json({ error: 'Service Unavailable (Queue Error)' });
                return;
            }
            // Si se subió desde la pestaña de Archivos o como parte de una carpeta mixta, guardarlo en Documentos también
            if (sourceTab === 'archivos' || relativePath || targetFolderId) {
                const ext = path_1.default.extname(req.file.originalname).substring(1) || 'file';
                exports.docDb.prepare(`
          INSERT INTO docs (id, name, savedName, extension, mimeType, size, absolutePath, clusterId, createdAt, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'READY')
        `).run(fileMeta.id + '-doc', fileMeta.originalName, fileMeta.savedName, ext, fileMeta.mimeType, fileMeta.size, null, finalClusterId, fileMeta.createdAt);
            }
            res.status(202).json({
                ...fileMeta,
                status: 'PROCESSING',
                message: 'Upload accepted, processing media in background'
            });
        }
        else {
            // Procesar documento
            const ext = path_1.default.extname(req.file.originalname).substring(1) || 'file';
            exports.docDb.prepare(`
        INSERT INTO docs (id, name, savedName, extension, mimeType, size, absolutePath, clusterId, createdAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING')
      `).run(fileMeta.id, fileMeta.originalName, fileMeta.savedName, ext, fileMeta.mimeType, fileMeta.size, null, finalClusterId, fileMeta.createdAt);
            try {
                await docQueue.add('process-doc', { id: fileMeta.id }, { jobId: fileMeta.id });
            }
            catch (err) {
                console.error('Redis Queue Error (docQueue):', err);
                exports.docDb.prepare(`DELETE FROM docs WHERE id = ?`).run(fileMeta.id);
                if (req.file && req.file.path && fs_1.default.existsSync(req.file.path))
                    fs_1.default.unlinkSync(req.file.path);
                res.status(503).json({ error: 'Service Unavailable (Queue Error)' });
                return;
            }
            broadcastSSE('upload_started', { id: fileMeta.id, originalName: fileMeta.originalName });
            res.status(202).json({
                ...fileMeta,
                status: 'PROCESSING',
                message: 'Document accepted, clustering in background'
            });
        }
    }
    catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});
// GET /api/documents
app.get('/api/documents', (_req, res) => {
    try {
        const docs = exports.docDb.prepare(`SELECT * FROM docs ORDER BY createdAt DESC`).all();
        res.json(docs);
    }
    catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});
// GET /api/documents/clusters (Renombrado conceptualmente a carpetas)
app.get('/api/documents/clusters', (_req, res) => {
    try {
        const clusters = exports.docDb.prepare(`SELECT * FROM doc_clusters ORDER BY createdAt DESC`).all();
        res.json(clusters);
    }
    catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});
// POST /api/documents/folders
app.post('/api/documents/folders', (req, res) => {
    try {
        const { name, parentId } = req.body;
        const id = 'f-' + Date.now().toString();
        exports.docDb.prepare(`
      INSERT INTO doc_clusters (id, name, description, createdAt, parentId)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, 'Carpeta', new Date().toISOString(), parentId || null);
        res.json({ id, name, parentId });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to create folder' });
    }
});
// PUT /api/documents/folders/:id
app.put('/api/documents/folders/:id', (req, res) => {
    try {
        const { name } = req.body;
        exports.docDb.prepare(`UPDATE doc_clusters SET name = ? WHERE id = ?`).run(name, req.params.id);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to rename folder' });
    }
});
// DELETE /api/documents/folders/:id
app.delete('/api/documents/folders/:id', (req, res) => {
    try {
        // SQLite will cascade delete documents if FOREIGN KEY ON DELETE CASCADE is set.
        // Wait, the docDb schema sets ON DELETE SET NULL for documents. 
        // We should manually delete documents inside it or let them fall to root.
        // Let's let them fall to root (SET NULL).
        exports.docDb.prepare(`DELETE FROM doc_clusters WHERE id = ?`).run(req.params.id);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to delete folder' });
    }
});
// PUT /api/documents/:id/move
app.put('/api/documents/:id/move', (req, res) => {
    try {
        const { folderId } = req.body; // clusterId
        exports.docDb.prepare(`UPDATE docs SET clusterId = ? WHERE id = ?`).run(folderId || null, req.params.id);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to move document' });
    }
});
// DELETE /api/documents/:id
app.delete('/api/documents/:id', (req, res) => {
    try {
        const doc = exports.docDb.prepare(`SELECT * FROM docs WHERE id = ?`).get(req.params.id);
        if (doc) {
            exports.docDb.prepare(`DELETE FROM docs WHERE id = ?`).run(req.params.id);
            try {
                if (doc.savedName)
                    fs_1.default.unlinkSync(path_1.default.join(absoluteStoragePath, doc.savedName));
            }
            catch (err) {
                console.error('Failed to delete file from disk', err);
            }
        }
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to delete document' });
    }
});
// POST /api/scan-local
app.post('/api/scan-local', async (req, res) => {
    let { directoryPath } = req.body;
    // Clean up quotes if user accidentally pasted them
    if (directoryPath) {
        directoryPath = directoryPath.replace(/^["']|["']$/g, '').trim();
        directoryPath = path_1.default.resolve(directoryPath);
    }
    if (directoryPath.startsWith('~')) {
        const os = require('os');
        directoryPath = path_1.default.join(os.homedir(), directoryPath.slice(1));
    }
    console.log('[Scan] Requested path:', directoryPath);
    try {
        if (!directoryPath || !fs_1.default.existsSync(directoryPath) || !fs_1.default.statSync(directoryPath).isDirectory()) {
            console.error('[Scan] Invalid directory:', directoryPath);
            res.status(400).json({ error: 'Directorio inválido o no encontrado: ' + directoryPath });
            return;
        }
    }
    catch (err) {
        console.error('[Scan] Error reading directory stat:', err);
        res.status(400).json({ error: 'Error de permisos o lectura al acceder al directorio: ' + directoryPath + ' - ' + err.message });
        return;
    }
    try {
        const walkAsync = async (dir, filelist = []) => {
            const files = await fs_1.default.promises.readdir(dir);
            for (const file of files) {
                const filepath = path_1.default.join(dir, file);
                const stat = await fs_1.default.promises.stat(filepath);
                if (stat.isDirectory()) {
                    filelist = await walkAsync(filepath, filelist);
                }
                else {
                    filelist.push(filepath);
                }
            }
            return filelist;
        };
        const files = await walkAsync(directoryPath);
        let queued = 0;
        for (const filePath of files) {
            const ext = path_1.default.extname(filePath).toLowerCase();
            // Only process common media extensions
            if (!['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.mp4', '.mov', '.webm', '.avi'].includes(ext)) {
                continue;
            }
            const stat = fs_1.default.statSync(filePath);
            const originalName = path_1.default.basename(filePath);
            // Determine MIME type simply based on extension
            let mimeType = 'application/octet-stream';
            if (ext === '.jpg' || ext === '.jpeg')
                mimeType = 'image/jpeg';
            else if (ext === '.png')
                mimeType = 'image/png';
            else if (ext === '.webp')
                mimeType = 'image/webp';
            else if (ext === '.heic')
                mimeType = 'image/heic';
            else if (ext === '.mp4')
                mimeType = 'video/mp4';
            else if (ext === '.mov')
                mimeType = 'video/quicktime';
            else if (ext === '.webm')
                mimeType = 'video/webm';
            const fileId = Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7);
            const fileMeta = {
                id: fileId,
                originalName: originalName,
                savedName: fileId + ext,
                mimeType,
                size: stat.size,
                createdAt: new Date().toISOString(),
                uploadSource: 'Directorio Local',
                absolutePath: filePath
            };
            exports.stmts.insertFile.run(fileMeta);
            broadcastSSE('upload_started', { id: fileMeta.id, originalName: fileMeta.originalName });
            try {
                await imageQueue.add('process-image', {
                    fileId: fileMeta.id,
                    savedName: fileMeta.savedName,
                    originalName: fileMeta.originalName,
                    mimeType: fileMeta.mimeType,
                    absolutePath: filePath
                });
            }
            catch (err) {
                console.error('Queue Error during scan:', err);
                exports.stmts.hardDelete.run(fileMeta.id);
                continue;
            }
            queued++;
        }
        res.json({ success: true, filesQueued: queued, message: `Queued ${queued} files for indexing` });
    }
    catch (error) {
        console.error('Scan error:', error);
        res.status(500).json({ error: 'Failed to scan directory' });
    }
});
// GET /api/files
app.get('/api/files', (_req, res) => {
    try {
        const files = exports.stmts.getFiles.all();
        res.json(files);
    }
    catch (error) {
        console.error('Fetch files error:', error);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});
// DELETE /api/files/:id  (soft delete → trash)
app.delete('/api/files/:id', (req, res) => {
    const { id } = req.params;
    try {
        const result = exports.stmts.softDelete.run(new Date().toISOString(), id);
        if (result.changes > 0) {
            res.json({ success: true });
            return;
        }
        res.status(404).json({ error: 'File not found' });
    }
    catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});
// GET /api/search
app.get('/api/search', async (req, res) => {
    const rawQuery = req.query.q;
    if (!rawQuery) {
        res.json([]);
        return;
    }
    if (!tokenizer || !textModel) {
        res.status(503).json({ error: 'AI models loading...' });
        return;
    }
    try {
        let query = rawQuery;
        try {
            query = await (0, translate_1.default)(rawQuery, { from: 'es', to: 'en' });
            console.log(`[Search] "${rawQuery}" -> "${query}"`);
        }
        catch (_) { }
        // Prefix with "a photo of a" for better CLIP alignment
        const clipQuery = `a photo of a ${query}`;
        const inputs = tokenizer([clipQuery]);
        const output = await textModel(inputs);
        const queryEmbedding = Array.from(output.text_embeds.data);
        const filesWithEmbedding = exports.stmts.getFilesWithEmbedding.all();
        let scored = filesWithEmbedding
            .map(f => ({ ...f, score: cosineSimilarity(queryEmbedding, JSON.parse(f.embedding)) }))
            .sort((a, b) => b.score - a.score);
        if (scored.length > 0) {
            const maxScore = scored[0].score;
            // Filtro dinámico: solo mantener imágenes que estén muy cerca del mejor resultado
            // y con un piso mínimo de 0.21 para evitar queries que no tienen ninguna coincidencia real
            scored = scored.filter(f => f.score >= Math.max(0.21, maxScore - 0.045));
        }
        const finalResults = scored
            .slice(0, 15) // Solo regresar top 15 máximo
            .map(({ embedding, ...rest }) => rest);
        res.json(finalResults);
    }
    catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});
// GET /api/trash
app.get('/api/trash', (_req, res) => {
    try {
        res.json(exports.stmts.getTrash.all());
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch trash' });
    }
});
// PUT /api/trash/:id/restore
app.put('/api/trash/:id/restore', (req, res) => {
    const { id } = req.params;
    try {
        const result = exports.stmts.restore.run(id);
        if (result.changes > 0) {
            res.json({ success: true });
            return;
        }
        res.status(404).json({ error: 'File not found in trash' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to restore file' });
    }
});
// DELETE /api/trash/:id  (hard delete)
app.delete('/api/trash/:id', (req, res) => {
    const { id } = req.params;
    try {
        const file = exports.stmts.getFileById.get(id);
        if (!file || !file.isDeleted) {
            res.status(404).json({ error: 'File not found in trash' });
            return;
        }
        // Delete main file
        if (file.savedName) {
            const filePath = path_1.default.join(absoluteStoragePath, file.savedName);
            if (fs_1.default.existsSync(filePath))
                fs_1.default.unlinkSync(filePath);
        }
        // Delete thumbnail
        if (file.thumbnailName) {
            const thumbPath = path_1.default.join(absoluteStoragePath, file.thumbnailName);
            if (fs_1.default.existsSync(thumbPath))
                fs_1.default.unlinkSync(thumbPath);
        }
        exports.stmts.hardDelete.run(id);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Hard delete error:', error);
        res.status(500).json({ error: 'Failed to delete file permanently' });
    }
});
// GET /api/duplicates (Archivos idénticos basados en tamaño y hash/blurhash)
app.get('/api/duplicates', (req, res) => {
    try {
        const files = exports.stmts.getFiles.all();
        // Group files by size and blurhash (extremely reliable fingerprint for identical files)
        const groups = new Map();
        for (const f of files) {
            if (!f.size || !f.blurhash)
                continue;
            const key = `${f.size}-${f.blurhash}`;
            if (!groups.has(key))
                groups.set(key, []);
            groups.get(key).push(f);
        }
        const duplicateGroups = Array.from(groups.values()).filter(g => g.length > 1);
        res.json(duplicateGroups);
    }
    catch (error) {
        console.error('Failed to fetch duplicates:', error);
        res.status(500).json({ error: 'Failed to fetch duplicates' });
    }
});
// GET /api/similars (Archivos similares basados en IA)
app.get('/api/similars', (req, res) => {
    try {
        const threshold = parseFloat(req.query.threshold) || 0.85;
        const files = exports.stmts.getFilesWithEmbedding.all();
        const parsedFiles = files.map(f => ({ ...f, vec: JSON.parse(f.embedding) }));
        const groups = [];
        const visited = new Set();
        for (let i = 0; i < parsedFiles.length; i++) {
            const f1 = parsedFiles[i];
            if (visited.has(f1.id))
                continue;
            const currentGroup = [f1];
            visited.add(f1.id);
            for (let j = i + 1; j < parsedFiles.length; j++) {
                const f2 = parsedFiles[j];
                if (visited.has(f2.id))
                    continue;
                const sim = cosineSimilarity(f1.vec, f2.vec);
                // Umbral dinámico para capturar mejor las ráfagas o fotos muy parecidas de la misma escena
                if (sim > threshold) {
                    currentGroup.push(f2);
                    visited.add(f2.id);
                }
            }
            if (currentGroup.length > 1)
                groups.push(currentGroup);
        }
        res.json(groups);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch similars' });
    }
});
// GET /api/albums
app.get('/api/albums', (_req, res) => {
    try {
        const albums = exports.stmts.getAlbums.all();
        const albumsWithCount = albums.map(album => {
            const files = exports.stmts.getAlbumFiles.all(album.id, album.id, album.id, album.id);
            // Get up to 5 random files for the cover carousel, prefer images over videos
            const coverFiles = files
                .filter(f => f.mimeType?.startsWith('image/'))
                .sort(() => 0.5 - Math.random())
                .slice(0, 5)
                .map(f => ({
                id: f.id,
                savedName: f.savedName,
                thumbnailName: f.thumbnailName,
                blurhash: f.blurhash
            }));
            return {
                ...album,
                photoCount: files.length,
                coverUrl: files[0] ? `/uploads/${files[0].savedName}` : null,
                coverFiles
            };
        });
        res.json(albumsWithCount);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch albums' });
    }
});
// GET /api/albums/:id
app.get('/api/albums/:id', (req, res) => {
    const { id } = req.params;
    try {
        const album = exports.stmts.getAlbumById.get(id);
        if (!album) {
            res.status(404).json({ error: 'Album not found' });
            return;
        }
        const files = exports.stmts.getAlbumFiles.all(id, id, id, id);
        res.json({
            ...album,
            photoCount: files.length,
            coverUrl: files[0] ? `/uploads/${files[0].savedName}` : null
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch album' });
    }
});
// GET /api/albums/:id/files
app.get('/api/albums/:id/files', (req, res) => {
    const { id } = req.params;
    try {
        const files = exports.stmts.getAlbumFiles.all(id, id, id, id);
        res.json(files);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch album files' });
    }
});
// GET /api/albums/:id/people
app.get('/api/albums/:id/people', (req, res) => {
    const { id } = req.params;
    try {
        const people = exports.stmts.getAlbumPeople.all(id);
        res.json(people.map(p => p.personId));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch album people' });
    }
});
// PUT /api/albums/:id/people
app.put('/api/albums/:id/people', (req, res) => {
    const { id } = req.params;
    const { personIds } = req.body;
    try {
        const updatePeople = exports.db.transaction((albumId, pIds) => {
            exports.stmts.deleteAlbumPeople.run(albumId);
            if (pIds && Array.isArray(pIds)) {
                for (const personId of pIds) {
                    exports.stmts.addPersonToAlbum.run(albumId, personId);
                }
            }
        });
        updatePeople(id, personIds || []);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Failed to update album people:', error);
        res.status(500).json({ error: 'Failed to update album people' });
    }
});
// POST /api/albums
app.post('/api/albums', (req, res) => {
    const { name, description, fileIds, personIds } = req.body;
    try {
        const newAlbum = {
            id: Date.now().toString(),
            name,
            description: description ?? null,
            coverUrl: null,
            createdAt: new Date().toISOString()
        };
        const insertAlbumAndFiles = exports.db.transaction((album, ids, pIds) => {
            exports.stmts.insertAlbum.run(album);
            if (ids && Array.isArray(ids)) {
                for (const fileId of ids) {
                    exports.stmts.addFileToAlbum.run(album.id, fileId);
                }
            }
            if (pIds && Array.isArray(pIds)) {
                for (const personId of pIds) {
                    exports.stmts.addPersonToAlbum.run(album.id, personId);
                }
            }
        });
        insertAlbumAndFiles(newAlbum, fileIds || [], personIds || []);
        res.status(201).json(newAlbum);
    }
    catch (error) {
        console.error('Failed to create album:', error);
        res.status(500).json({ error: 'Failed to create album' });
    }
});
// PUT /api/albums/:id/add
app.put('/api/albums/:id/add', (req, res) => {
    const { id } = req.params;
    const { fileIds } = req.body;
    try {
        const addMany = exports.db.transaction((ids) => {
            for (const fileId of ids)
                exports.stmts.addFileToAlbum.run(id, fileId);
        });
        addMany(fileIds || []);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update album' });
    }
});
// PUT /api/albums/:id
app.put('/api/albums/:id', (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || name.trim() === '') {
        res.status(400).json({ error: 'Name is required' });
        return;
    }
    try {
        const result = exports.stmts.updateAlbumName.run(name.trim(), id);
        if (result.changes > 0) {
            res.json({ success: true });
        }
        else {
            res.status(404).json({ error: 'Album not found' });
        }
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to rename album' });
    }
});
// DELETE /api/albums/:id
app.delete('/api/albums/:id', (req, res) => {
    const { id } = req.params;
    try {
        const result = exports.stmts.deleteAlbum.run(id);
        if (result.changes > 0) {
            res.json({ success: true });
        }
        else {
            res.status(404).json({ error: 'Album not found' });
        }
    }
    catch (error) {
        console.error('Delete album error:', error);
        res.status(500).json({ error: 'Failed to delete album' });
    }
});
// PUT /api/files/:id/favorite
app.put('/api/files/:id/favorite', (req, res) => {
    const { id } = req.params;
    try {
        const file = exports.stmts.getFileById.get(id);
        if (!file) {
            res.status(404).json({ error: 'File not found' });
            return;
        }
        const newStatus = file.isFavorite ? 0 : 1;
        const toggleFav = exports.db.transaction(() => {
            exports.db.prepare(`UPDATE files SET isFavorite = ? WHERE id = ?`).run(newStatus, id);
            // Ensure "Favoritas" album exists
            let favAlbum = exports.db.prepare(`SELECT * FROM albums WHERE name = 'Favoritas' COLLATE NOCASE`).get();
            if (!favAlbum) {
                favAlbum = { id: Date.now().toString(), name: 'Favoritas', description: null, coverUrl: null, createdAt: new Date().toISOString() };
                exports.stmts.insertAlbum.run(favAlbum);
            }
            if (newStatus === 1) {
                exports.stmts.addFileToAlbum.run(favAlbum.id, id);
            }
            else {
                exports.stmts.removeFileFromAlbum.run(favAlbum.id, id);
            }
        });
        toggleFav();
        res.json({ isFavorite: newStatus === 1 });
    }
    catch (error) {
        console.error('Toggle favorite error:', error);
        res.status(500).json({ error: 'Failed to toggle favorite' });
    }
});
// DELETE /api/albums/:id/files
app.delete('/api/albums/:id/files', (req, res) => {
    const { id } = req.params;
    const { fileIds } = req.body;
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
        res.status(400).json({ error: 'fileIds must be a non-empty array' });
        return;
    }
    try {
        const deleteMany = exports.db.transaction((files) => {
            let count = 0;
            for (const fileId of files) {
                const result = exports.stmts.removeFileFromAlbum.run(id, fileId);
                count += result.changes;
            }
            return count;
        });
        const removedCount = deleteMany(fileIds);
        res.json({ success: true, removedCount });
    }
    catch (error) {
        console.error('Error removing files from album:', error);
        res.status(500).json({ error: 'Failed to remove files from album' });
    }
});
// POST /api/analyze-faces
app.post('/api/analyze-faces', async (req, res) => {
    const { fileId } = req.body;
    try {
        const file = exports.stmts.getFileById.get(fileId);
        if (!file) {
            res.status(404).json({ error: 'File not found' });
            return;
        }
        const filePath = path_1.default.join(absoluteStoragePath, file.savedName);
        const pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:8000';
        const pythonRes = await fetch(`${pythonApiUrl}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagePath: filePath })
        });
        if (pythonRes.ok) {
            const data = await pythonRes.json();
            exports.stmts.updateFaces.run(JSON.stringify(data.faces), fileId);
            res.json(data);
            return;
        }
        res.status(pythonRes.status).json({ error: 'Python microservice error' });
    }
    catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: 'Failed to connect to Python AI' });
    }
});
app.get('/api/people/status', (req, res) => {
    try {
        const totalRow = exports.db.prepare(`SELECT COUNT(*) as count FROM files WHERE mimeType LIKE 'image/%' AND isDeleted = 0`).get();
        const processedRow = exports.db.prepare(`SELECT COUNT(*) as count FROM files WHERE mimeType LIKE 'image/%' AND status = 'READY' AND isDeleted = 0`).get();
        res.json({ total: totalRow.count, processed: processedRow.count });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.get('/api/people', (req, res) => {
    try {
        const people = exports.db.prepare(`
      SELECT p.id, p.name, f.savedName as coverFile, f.thumbnailName as coverThumbnail, f.blurhash as coverBlurhash,
             COUNT(DISTINCT ff.fileId) as faceCount 
      FROM people p 
      LEFT JOIN file_faces ff ON p.id = ff.personId 
      LEFT JOIN files f ON p.coverFileId = f.id 
      WHERE p.isHidden = 0
      GROUP BY p.id 
      ORDER BY faceCount DESC
    `).all();
        res.json(people);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.put('/api/people/:id', (req, res) => {
    try {
        exports.db.prepare('UPDATE people SET name = ? WHERE id = ?').run(req.body.name, req.params.id);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});
app.post('/api/people/:id/hide', (req, res) => {
    try {
        exports.db.prepare('UPDATE people SET isHidden = 1 WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});
app.put('/api/people/:id/cover', (req, res) => {
    try {
        console.log(`[Cover API] Setting cover for ${req.params.id} to ${req.body.fileId}`);
        exports.db.prepare('UPDATE people SET coverFileId = ? WHERE id = ?').run(req.body.fileId, req.params.id);
        res.json({ success: true });
    }
    catch (e) {
        console.error('[Cover API] Error:', e);
        res.status(500).json({ error: 'Failed' });
    }
});
app.get('/api/people/:id/face', async (req, res) => {
    try {
        const personId = req.params.id;
        let faceRow = exports.db.prepare(`
      SELECT ff.boxX, ff.boxY, ff.boxW, ff.boxH, f.thumbnailName, f.savedName
      FROM people p
      JOIN file_faces ff ON p.id = ff.personId AND p.coverFileId = ff.fileId
      JOIN files f ON ff.fileId = f.id
      WHERE p.id = ?
    `).get(personId);
        console.log(`[Face API] Fetching face for person ${personId}. Cover face found: ${!!faceRow}`);
        if (!faceRow) {
            faceRow = exports.db.prepare(`
        SELECT ff.boxX, ff.boxY, ff.boxW, ff.boxH, f.thumbnailName, f.savedName
        FROM file_faces ff
        JOIN files f ON ff.fileId = f.id
        WHERE ff.personId = ?
        LIMIT 1
      `).get(personId);
            console.log(`[Face API] Fallback face found: ${!!faceRow}`);
        }
        if (!faceRow) {
            return res.status(404).json({ error: 'Face not found' });
        }
        const imageToUse = faceRow.thumbnailName || faceRow.savedName;
        console.log(`[Face API] imageToUse for person ${personId}:`, imageToUse);
        if (!imageToUse) {
            return res.status(404).json({ error: 'Image not found' });
        }
        const imagePath = path_1.default.join(absoluteStoragePath, imageToUse);
        if (!fs_1.default.existsSync(imagePath)) {
            return res.status(404).json({ error: 'Image file not found' });
        }
        const metadata = await (0, sharp_1.default)(imagePath).metadata();
        let left = Math.max(0, Math.floor(faceRow.boxX));
        let top = Math.max(0, Math.floor(faceRow.boxY));
        let width = Math.floor(faceRow.boxW);
        let height = Math.floor(faceRow.boxH);
        const paddingX = Math.floor(width * 0.4);
        const paddingY = Math.floor(height * 0.4);
        left = Math.max(0, left - paddingX);
        top = Math.max(0, top - paddingY);
        width = Math.min(metadata.width - left, width + paddingX * 2);
        height = Math.min(metadata.height - top, height + paddingY * 2);
        const buffer = await (0, sharp_1.default)(imagePath)
            .extract({ left, top, width, height })
            .resize(200, 200, { fit: 'cover' })
            .jpeg({ quality: 90 })
            .toBuffer();
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=31536000');
        res.send(buffer);
    }
    catch (error) {
        console.error('Error generating face thumbnail:', error);
        res.status(500).json({ error: 'Failed to generate face thumbnail' });
    }
});
app.get('/api/files/:id/people', (req, res) => {
    try {
        const people = exports.db.prepare(`
      SELECT p.id, p.name, p.coverFileId
      FROM file_faces ff
      JOIN people p ON ff.personId = p.id
      WHERE ff.fileId = ? AND p.isHidden = 0
      GROUP BY p.id
    `).all(req.params.id);
        res.json(people);
    }
    catch (err) {
        console.error('Error fetching file people:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.get('/api/people/:id/photos', (req, res) => {
    try {
        const alsoWith = req.query.alsoWith;
        let files;
        if (alsoWith) {
            const ids = [req.params.id, ...alsoWith.split(',')];
            const placeholders = ids.map(() => '?').join(',');
            files = exports.db.prepare(`
        SELECT f.*
        FROM files f
        JOIN file_faces ff ON f.id = ff.fileId
        WHERE ff.personId IN (${placeholders}) AND f.isDeleted = 0
        GROUP BY f.id
        HAVING COUNT(DISTINCT ff.personId) = ?
        ORDER BY COALESCE(f.takenAt, f.createdAt) DESC
      `).all(...ids, ids.length);
        }
        else {
            files = exports.db.prepare(`
        SELECT DISTINCT f.* FROM files f
        JOIN file_faces ff ON f.id = ff.fileId
        WHERE ff.personId = ? AND f.isDeleted = 0
        ORDER BY COALESCE(f.takenAt, f.createdAt) DESC
      `).all(req.params.id);
        }
        res.json(files);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed' });
    }
});
app.get('/api/people/:id/co-occurring', (req, res) => {
    try {
        const alsoWith = req.query.alsoWith;
        const ids = alsoWith ? [req.params.id, ...alsoWith.split(',')] : [req.params.id];
        const placeholders = ids.map(() => '?').join(',');
        const coOccurring = exports.db.prepare(`
      SELECT p.id, p.name, f.savedName as coverFile, f.thumbnailName as coverThumbnail, f.blurhash as coverBlurhash,
             COUNT(DISTINCT ff2.fileId) as coOccurCount
      FROM file_faces ff2
      JOIN people p ON ff2.personId = p.id
      LEFT JOIN files f ON p.coverFileId = f.id
      WHERE ff2.fileId IN (
          SELECT fileId
          FROM file_faces
          WHERE personId IN (${placeholders})
          GROUP BY fileId
          HAVING COUNT(DISTINCT personId) = ?
      )
      AND p.id NOT IN (${placeholders})
      AND p.isHidden = 0
      GROUP BY p.id
      ORDER BY coOccurCount DESC
      LIMIT 10
    `).all(...ids, ids.length, ...ids);
        res.json(coOccurring);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed' });
    }
});
app.post('/api/people/merge', (req, res) => {
    try {
        const { personIds } = req.body;
        if (!personIds || personIds.length < 2) {
            return res.status(400).json({ error: 'Requires at least 2 person IDs' });
        }
        const people = personIds.map(id => exports.db.prepare('SELECT * FROM people WHERE id = ?').get(id)).filter(Boolean);
        if (people.length < 2) {
            return res.status(400).json({ error: 'Invalid person IDs' });
        }
        let targetId = people[0].id;
        const namedPerson = people.find(p => p.name && p.name !== 'Desconocido');
        if (namedPerson) {
            targetId = namedPerson.id;
        }
        const sourceIds = personIds.filter(id => id !== targetId);
        const mergeTx = exports.db.transaction(() => {
            for (const src of sourceIds) {
                exports.db.prepare('UPDATE file_faces SET personId = ? WHERE personId = ?').run(targetId, src);
                exports.db.prepare('DELETE FROM people WHERE id = ?').run(src);
            }
        });
        mergeTx();
        res.json({ success: true, targetId });
    }
    catch (error) {
        console.error('Error merging people:', error);
        res.status(500).json({ error: 'Failed to merge people' });
    }
});
app.post('/api/people/:id/remove-photos', (req, res) => {
    try {
        const { id } = req.params;
        const { fileIds } = req.body;
        if (!fileIds || !fileIds.length) {
            return res.status(400).json({ error: 'No files specified' });
        }
        const placeholders = fileIds.map(() => '?').join(',');
        const removeTx = exports.db.transaction(() => {
            exports.db.prepare(`DELETE FROM file_faces WHERE personId = ? AND fileId IN (${placeholders})`).run(id, ...fileIds);
            const remainingFaces = exports.db.prepare('SELECT COUNT(*) as count FROM file_faces WHERE personId = ?').get(id);
            if (remainingFaces.count === 0) {
                exports.db.prepare('DELETE FROM people WHERE id = ?').run(id);
            }
        });
        removeTx();
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error removing photos from person:', error);
        res.status(500).json({ error: 'Failed to remove photos' });
    }
});
// --- TRASH CLEANUP JOB ---
const cleanupTrash = () => {
    try {
        const olderThan60Days = new Date();
        olderThan60Days.setDate(olderThan60Days.getDate() - 60);
        const dateStr = olderThan60Days.toISOString();
        const filesToDelete = exports.db.prepare(`SELECT id, savedName, thumbnailName FROM files WHERE isDeleted = 1 AND deletedAt <= ?`).all(dateStr);
        if (filesToDelete.length > 0) {
            console.log(`🧹 Auto-deleting ${filesToDelete.length} files from trash (older than 60 days)...`);
            filesToDelete.forEach(f => {
                try {
                    if (fs_1.default.existsSync(path_1.default.join(absoluteStoragePath, f.savedName))) {
                        fs_1.default.unlinkSync(path_1.default.join(absoluteStoragePath, f.savedName));
                    }
                    if (f.thumbnailName && fs_1.default.existsSync(path_1.default.join(absoluteStoragePath, f.thumbnailName))) {
                        fs_1.default.unlinkSync(path_1.default.join(absoluteStoragePath, f.thumbnailName));
                    }
                }
                catch (e) {
                    console.error(`Failed to delete physical file for ${f.id}`, e);
                }
                exports.stmts.hardDelete.run(f.id);
            });
        }
    }
    catch (error) {
        console.error('Error in cleanupTrash:', error);
    }
};
// Run on startup and every hour
cleanupTrash();
setInterval(cleanupTrash, 60 * 60 * 1000);
app.listen(port, () => {
    console.log(`✅ Server running on port ${port} — SQLite DB: ${dbPath}`);
});
