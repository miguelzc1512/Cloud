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
exports.stmts = exports.db = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const translate_1 = __importDefault(require("translate"));
const multer_1 = __importDefault(require("multer"));
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
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
const dbPath = path_1.default.resolve(__dirname, '..', 'nube.db');
exports.db = new better_sqlite3_1.default(dbPath);
// Enable WAL mode for better concurrent read performance
exports.db.pragma('journal_mode = WAL');
exports.db.pragma('foreign_keys = ON');
// Create tables
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
    faces TEXT
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
`);
// ─── Prepared Statements (compiled once, fast always) ──────────────────────
exports.stmts = {
    insertFile: exports.db.prepare(`
    INSERT INTO files (id, originalName, savedName, mimeType, size, status, createdAt, isDeleted)
    VALUES (@id, @originalName, @savedName, @mimeType, @size, 'PROCESSING', @createdAt, 0)
  `),
    getFiles: exports.db.prepare(`
    SELECT id, originalName, savedName, thumbnailName, blurhash, width, height, status, mimeType, size, createdAt, takenAt, latitude, longitude
    FROM files WHERE isDeleted = 0 ORDER BY COALESCE(takenAt, createdAt) DESC
  `),
    getFilesWithEmbedding: exports.db.prepare(`
    SELECT id, originalName, savedName, thumbnailName, blurhash, mimeType, size, createdAt, takenAt, latitude, longitude, embedding
    FROM files WHERE isDeleted = 0 AND embedding IS NOT NULL
  `),
    softDelete: exports.db.prepare(`UPDATE files SET isDeleted = 1, deletedAt = ? WHERE id = ? AND isDeleted = 0`),
    getTrash: exports.db.prepare(`
    SELECT id, originalName, savedName, thumbnailName, blurhash, mimeType, size, createdAt, takenAt, latitude, longitude, isDeleted, deletedAt
    FROM files WHERE isDeleted = 1 ORDER BY COALESCE(takenAt, createdAt) DESC
  `),
    restore: exports.db.prepare(`UPDATE files SET isDeleted = 0, deletedAt = NULL WHERE id = ? AND isDeleted = 1`),
    getFileById: exports.db.prepare(`SELECT * FROM files WHERE id = ?`),
    hardDelete: exports.db.prepare(`DELETE FROM files WHERE id = ? AND isDeleted = 1`),
    updateFaces: exports.db.prepare(`UPDATE files SET faces = ? WHERE id = ?`),
    insertAlbum: exports.db.prepare(`INSERT INTO albums (id, name, description, coverUrl, createdAt) VALUES (@id, @name, @description, @coverUrl, @createdAt)`),
    getAlbums: exports.db.prepare(`SELECT * FROM albums ORDER BY createdAt DESC`),
    getAlbumFiles: exports.db.prepare(`SELECT f.* FROM files f JOIN album_files af ON f.id = af.fileId WHERE af.albumId = ? AND f.isDeleted = 0`),
    addFileToAlbum: exports.db.prepare(`INSERT OR IGNORE INTO album_files (albumId, fileId) VALUES (?, ?)`),
    removeFileFromAlbum: exports.db.prepare(`DELETE FROM album_files WHERE albumId = ? AND fileId = ?`),
    updateAlbumName: exports.db.prepare(`UPDATE albums SET name = ? WHERE id = ?`),
    deleteAlbum: exports.db.prepare(`DELETE FROM albums WHERE id = ?`),
    getAlbumById: exports.db.prepare(`SELECT * FROM albums WHERE id = ?`),
};
// ─── Express Middleware ────────────────────────────────────────────────────
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/uploads', express_1.default.static(absoluteStoragePath));
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
const redisConnection = new ioredis_1.default({ maxRetriesPerRequest: null });
const imageQueue = new bullmq_1.Queue('image-processing', { connection: redisConnection });
// ─── Routes ───────────────────────────────────────────────────────────────
// POST /api/upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        const fileMeta = {
            id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7),
            originalName: req.file.originalname,
            savedName: req.file.filename,
            mimeType: req.file.mimetype,
            size: req.file.size,
            createdAt: new Date().toISOString()
        };
        // 1. Guardar registro inicial en la DB rápido
        exports.stmts.insertFile.run(fileMeta);
        // 2. Encolar trabajo de procesamiento asíncrono
        await imageQueue.add('process-image', {
            fileId: fileMeta.id,
            savedName: fileMeta.savedName,
            originalName: fileMeta.originalName,
            mimeType: fileMeta.mimeType
        });
        res.status(202).json({
            ...fileMeta,
            status: 'PROCESSING',
            message: 'Upload accepted, processing in background'
        });
    }
    catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
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
// GET /api/albums
app.get('/api/albums', (_req, res) => {
    try {
        const albums = exports.stmts.getAlbums.all();
        const albumsWithCount = albums.map(album => {
            const files = exports.stmts.getAlbumFiles.all(album.id);
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
        const files = exports.stmts.getAlbumFiles.all(id);
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
        const files = exports.stmts.getAlbumFiles.all(id);
        res.json(files);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch album files' });
    }
});
// POST /api/albums
app.post('/api/albums', (req, res) => {
    const { name, description, fileIds } = req.body;
    try {
        const newAlbum = {
            id: Date.now().toString(),
            name,
            description: description ?? null,
            coverUrl: null,
            createdAt: new Date().toISOString()
        };
        const insertAlbumAndFiles = exports.db.transaction((album, ids) => {
            exports.stmts.insertAlbum.run(album);
            if (ids && Array.isArray(ids)) {
                for (const fileId of ids) {
                    exports.stmts.addFileToAlbum.run(album.id, fileId);
                }
            }
        });
        insertAlbumAndFiles(newAlbum, fileIds || []);
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
        const pythonRes = await fetch('http://localhost:8000/analyze', {
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
