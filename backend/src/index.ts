import express, { Request, Response } from 'express';
import cors from 'cors';
import translate from 'translate';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs';
import exifr from 'exifr';
import path from 'path';
import Database from 'better-sqlite3';
import sharp from 'sharp';
const archiver = require('archiver');
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const storagePath = process.env.STORAGE_PATH || '../storage';

// Ensure storage directory exists
const absoluteStoragePath = path.resolve(__dirname, '..', storagePath);
if (!fs.existsSync(absoluteStoragePath)) {
  fs.mkdirSync(absoluteStoragePath, { recursive: true });
}

// ─── SQLite Database Setup ─────────────────────────────────────────────────
const STORAGE_PATH = process.env.STORAGE_PATH || path.resolve(__dirname, '..', '..', 'storage');
const dbPath = path.resolve(STORAGE_PATH, 'nube.db');
export const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

// Create tables
const docDbPath = path.resolve(STORAGE_PATH, 'documents.db');
export const docDb = new Database(docDbPath);
docDb.pragma('journal_mode = WAL');
docDb.pragma('busy_timeout = 5000');
docDb.pragma('foreign_keys = ON');

docDb.exec(`
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
  docDb.exec(`ALTER TABLE doc_clusters ADD COLUMN parentId TEXT REFERENCES doc_clusters(id) ON DELETE CASCADE`);
} catch (e) {
  // Column might already exist, ignore
}

try {
  docDb.exec(`ALTER TABLE docs ADD COLUMN isDeleted INTEGER NOT NULL DEFAULT 0`);
  docDb.exec(`ALTER TABLE docs ADD COLUMN deletedAt TEXT`);
} catch (e) {
  // Column might already exist, ignore
}

try {
  docDb.exec(`ALTER TABLE docs ADD COLUMN thumbnailName TEXT`);
  docDb.exec(`ALTER TABLE docs ADD COLUMN blurhash TEXT`);
} catch (e) {
  // Column might already exist, ignore
}

try {
  docDb.exec(`ALTER TABLE doc_clusters ADD COLUMN deletedAt TEXT`);
} catch (e) {
  // Column might already exist, ignore
}

db.exec(`
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
  db.exec(`ALTER TABLE files ADD COLUMN uploadSource TEXT;`);
} catch (e) {}

try {
  db.exec(`ALTER TABLE files ADD COLUMN absolutePath TEXT;`);
} catch (e) {}

try {
  db.exec(`ALTER TABLE files ADD COLUMN isFavorite INTEGER DEFAULT 0;`);
} catch (e) {}

try {
  db.exec(`ALTER TABLE file_faces ADD COLUMN id TEXT;`);
} catch (e) {}

try {
  db.exec(`ALTER TABLE file_faces ADD COLUMN descriptor TEXT;`);
} catch (e) {}

// ─── Prepared Statements (compiled once, fast always) ──────────────────────
export const stmts = {
  insertFile: db.prepare(`
    INSERT INTO files (id, originalName, savedName, mimeType, size, status, createdAt, isDeleted, uploadSource, absolutePath)
    VALUES (@id, @originalName, @savedName, @mimeType, @size, 'PROCESSING', @createdAt, 0, @uploadSource, @absolutePath)
  `),
  getFiles: db.prepare(`
    SELECT id, originalName, savedName, thumbnailName, blurhash, width, height, status, mimeType, size, createdAt, takenAt, latitude, longitude, uploadSource, isFavorite, absolutePath
    FROM files WHERE isDeleted = 0 ORDER BY COALESCE(takenAt, createdAt) DESC
  `),
  getFilesWithEmbedding: db.prepare(`
    SELECT id, originalName, savedName, thumbnailName, blurhash, mimeType, size, createdAt, takenAt, latitude, longitude, embedding, uploadSource, absolutePath
    FROM files WHERE isDeleted = 0 AND embedding IS NOT NULL
  `),
  softDelete: db.prepare(`UPDATE files SET isDeleted = 1, deletedAt = ? WHERE id = ? AND isDeleted = 0`),
  getTrash: db.prepare(`
    SELECT id, originalName, savedName, thumbnailName, blurhash, mimeType, size, createdAt, takenAt, latitude, longitude, isDeleted, deletedAt, uploadSource, isFavorite, absolutePath
    FROM files WHERE isDeleted = 1 ORDER BY COALESCE(takenAt, createdAt) DESC
  `),
  restore: db.prepare(`UPDATE files SET isDeleted = 0, deletedAt = NULL WHERE id = ? AND isDeleted = 1`),
  getFileById: db.prepare(`SELECT * FROM files WHERE id = ?`),
  hardDelete: db.prepare(`DELETE FROM files WHERE id = ? AND isDeleted = 1`),
  updateFaces: db.prepare(`UPDATE files SET faces = ? WHERE id = ?`),
  toggleFavorite: db.prepare(`UPDATE files SET isFavorite = NOT isFavorite WHERE id = ?`),
  insertAlbum: db.prepare(`INSERT INTO albums (id, name, description, coverUrl, createdAt) VALUES (@id, @name, @description, @coverUrl, @createdAt)`),
  getAlbums: db.prepare(`SELECT * FROM albums ORDER BY createdAt DESC`),
  getAlbumFiles: db.prepare(`
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
  addFileToAlbum: db.prepare(`INSERT OR IGNORE INTO album_files (albumId, fileId) VALUES (?, ?)`),
  addPersonToAlbum: db.prepare(`INSERT OR IGNORE INTO album_people (albumId, personId) VALUES (?, ?)`),
  removeFileFromAlbum: db.prepare(`DELETE FROM album_files WHERE albumId = ? AND fileId = ?`),
  updateAlbumName: db.prepare(`UPDATE albums SET name = ? WHERE id = ?`),
  deleteAlbum: db.prepare(`DELETE FROM albums WHERE id = ?`),
  getAlbumById: db.prepare(`SELECT * FROM albums WHERE id = ?`),
  getAlbumPeople: db.prepare(`SELECT personId FROM album_people WHERE albumId = ?`),
  deleteAlbumPeople: db.prepare(`DELETE FROM album_people WHERE albumId = ?`),
};

// ─── Express Middleware ────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(absoluteStoragePath));
app.use('/public', express.static(path.resolve(__dirname, '..', 'public')));

const multerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, absoluteStoragePath),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: multerStorage });

// ─── Cosine Similarity for Semantic Search ────────────────────────────────
function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── AI Models ────────────────────────────────────────────────────────────
let visionPipeline: any = null;
let tokenizer: any;
let textModel: any;

async function initModels() {
  console.log('Loading AI Models (this may take a while on first run)...');
  try {
    const { pipeline, env, AutoTokenizer, CLIPTextModelWithProjection } = await import('@huggingface/transformers');
    env.localModelPath = './models';
    env.allowRemoteModels = true;
    tokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch32');
    textModel = await CLIPTextModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch32');
    visionPipeline = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
    console.log('AI Models loaded successfully.');
  } catch (e) {
    console.error('Error loading models:', e);
  }
}
initModels();

import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

// Configurar Redis y Queue
const redisConnection = new IORedis({ host: process.env.REDIS_HOST || '127.0.0.1', maxRetriesPerRequest: null });
const imageQueue = new Queue('image-processing', { connection: redisConnection as any });
const imageQueueEvents = new QueueEvents('image-processing', { connection: redisConnection as any });

const docQueue = new Queue('doc-processing', { connection: redisConnection as any });

// ─── Server-Sent Events (SSE) ─────────────────────────────────────────────
const sseClients = new Set<Response>();

function broadcastSSE(event: string, data: any) {
  sseClients.forEach(client => {
    client.write(`event: ${event}\n`);
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

imageQueueEvents.on('completed', ({ jobId, returnvalue }) => {
  broadcastSSE('photo_ready', { jobId });
});

// ─── Routes ───────────────────────────────────────────────────────────────

app.get('/api/download/zip', (req: Request, res: Response): void => {
  const idsParam = req.query.ids as string;
  if (!idsParam) {
    res.status(400).json({ error: 'Missing ids parameter' });
    return;
  }
  const ids = idsParam.split(',');
  if (ids.length === 0) {
    res.status(400).json({ error: 'No ids provided' });
    return;
  }

  const validFiles: any[] = [];
  ids.forEach(id => {
    if (!id.trim()) return;
    let file = stmts.getFileById.get(id) as any;
    if (!file) {
      file = docDb.prepare(`SELECT * FROM docs WHERE id = ?`).get(id) as any;
    }
    if (file) {
      const filePath = file.absolutePath || path.join(absoluteStoragePath, file.savedName);
      if (fs.existsSync(filePath)) {
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
    console.log("ARCHIVER TYPE:", typeof archiver, archiver); const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    archive.on('error', (err: any) => {
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
  } catch (err: any) {
    console.error('ZIP setup error:', err);
    if (!res.headersSent) {
      res.status(500).send({ error: err.message });
    }
  }
});

// GET /api/media/:id/:type
app.get('/api/media/:id/:type', (req: Request, res: Response): void => {
  const { id, type } = req.params;
  try {
    const file = stmts.getFileById.get(id) as any;
    if (!file) { res.status(404).json({ error: 'File not found' }); return; }

    if (type === 'original') {
      const filePath = file.absolutePath || path.join(absoluteStoragePath, file.savedName);
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
      } else {
        res.status(404).json({ error: 'Original file missing on disk' });
      }
    } else if (type === 'thumbnail') {
      const thumbName = file.thumbnailName || file.savedName;
      const thumbPath = path.join(absoluteStoragePath, thumbName);
      if (fs.existsSync(thumbPath)) {
        res.sendFile(thumbPath);
      } else if (file.absolutePath && fs.existsSync(file.absolutePath)) {
        res.sendFile(file.absolutePath); // Fallback to original if thumb is missing
      } else {
        res.sendFile(path.join(absoluteStoragePath, file.savedName)); // Fallback to savedName
      }
    } else if (type === 'web') {
      if (file.mimeType?.startsWith('video/')) {
        const webPath = path.join(absoluteStoragePath, `thumbnails/web-${file.savedName}.webm`);
        if (fs.existsSync(webPath)) { res.sendFile(webPath); return; }
      } else if (file.mimeType?.startsWith('image/heic') || file.mimeType?.startsWith('image/heif')) {
        const webPath = path.join(absoluteStoragePath, `thumbnails/web-${file.savedName}.webp`);
        if (fs.existsSync(webPath)) { res.sendFile(webPath); return; }
      }
      // Fallback to original
      const filePath = file.absolutePath || path.join(absoluteStoragePath, file.savedName);
      if (fs.existsSync(filePath)) res.sendFile(filePath);
      else res.status(404).json({ error: 'Web file missing' });
    } else {
      res.status(400).json({ error: 'Invalid type' });
    }
  } catch (error) {
    console.error('Media endpoint error:', error);
    res.status(500).json({ error: 'Failed to serve media' });
  }
});

const settingsPath = path.join(absoluteStoragePath, 'settings.json');
let currentSettings = { powerMode: 'eco' };
if (fs.existsSync(settingsPath)) {
  try { currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch(e) {}
}

app.post('/api/unlink-folder', (req: Request, res: Response) => {
  const { folderPath, deleteFromCloud } = req.body;
  if (!folderPath) {
    res.status(400).json({ error: 'folderPath is required' });
    return;
  }

  if (deleteFromCloud) {
    // Buscar archivos (fotos/videos) que tengan ese absolutePath
    const filesStmt = db.prepare(`SELECT id, originalName, savedName FROM files WHERE absolutePath LIKE ? AND isDeleted = 0`);
    const files = filesStmt.all(`${folderPath}%`) as any[];
    
    // Buscar documentos que tengan ese absolutePath
    const docsStmt = docDb.prepare(`SELECT id, savedName FROM docs WHERE absolutePath LIKE ? AND isDeleted = 0`);
    const docs = docsStmt.all(`${folderPath}%`) as any[];

    // Soft delete para fotos/videos
    const now = new Date().toISOString();
    db.prepare(`UPDATE files SET isDeleted = 1, deletedAt = ? WHERE absolutePath LIKE ?`).run(now, `${folderPath}%`);
    
    // Soft delete para documentos
    docDb.prepare(`UPDATE docs SET isDeleted = 1, deletedAt = ? WHERE absolutePath LIKE ?`).run(now, `${folderPath}%`);

    console.log(`[Unlink] Soft deleted ${files.length} media files and ${docs.length} documents from folder: ${folderPath}`);
  }

  res.json({ ok: true });
});

app.get('/api/config', (req, res) => res.json(currentSettings));

app.post('/api/config/power-mode', (req, res) => {
  const { mode } = req.body;
  if (mode === 'eco' || mode === 'max') {
    currentSettings.powerMode = mode;
    fs.writeFileSync(settingsPath, JSON.stringify(currentSettings));
    broadcastSSE('powerModeChanged', { mode });
  }
  res.json({ success: true, mode: currentSettings.powerMode });
});

// GET /api/stream (SSE)
app.get('/api/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// POST /api/worker-event (recibe eventos del Worker para reenviarlos a los clientes SSE)
app.post('/api/worker-event', (req: Request, res: Response) => {
  const { fileId, step, label, originalName, contentType } = req.body;
  if (fileId && step) {
    broadcastSSE('worker_step', { fileId, step, label, originalName, contentType: contentType || 'gallery' });
  }
  res.json({ ok: true });
});

// Función para crear/buscar la estructura de carpetas en una transacción
const resolveFoldersTransaction = docDb.transaction((relativePath: string, targetFolderId: string | null) => {
  if (!relativePath) return targetFolderId;
  const parts = relativePath.split('/');
  if (parts.length <= 1) return targetFolderId;
  
  const folderNames = parts.slice(0, parts.length - 1);
  let currentParentId = targetFolderId;
  
  const getFolderNull = docDb.prepare(`SELECT id FROM doc_clusters WHERE name = ? AND parentId IS NULL`);
  const getFolderNotNull = docDb.prepare(`SELECT id FROM doc_clusters WHERE name = ? AND parentId = ?`);
  const createFolder = docDb.prepare(`INSERT INTO doc_clusters (id, name, parentId, createdAt) VALUES (?, ?, ?, ?)`);

  for (const folderName of folderNames) {
    let row = currentParentId === null 
      ? getFolderNull.get(folderName) as any
      : getFolderNotNull.get(folderName, currentParentId) as any;
      
    if (row) {
      currentParentId = row.id;
    } else {
      const newId = 'f-' + Date.now().toString() + Math.random().toString(36).slice(2, 6);
      createFolder.run(newId, folderName, currentParentId, new Date().toISOString());
      currentParentId = newId;
    }
  }
  return currentParentId;
});

// POST /api/upload
app.post('/api/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

    const relativePath = req.body.relativePath || null;
    const targetFolderId = req.body.targetFolderId === 'null' ? null : (req.body.targetFolderId || null);
    const sourceTab = req.body.sourceTab || null;

    let finalClusterId = targetFolderId;
    if (relativePath) {
      finalClusterId = resolveFoldersTransaction(relativePath, targetFolderId);
    }

    let uploadSource = 'Navegador Web';
    const ua = req.headers['user-agent'] || '';
    if (/Mac OS X/.test(ua)) uploadSource = 'macOS';
    else if (/Windows/.test(ua)) uploadSource = 'Windows';
    else if (/iPhone|iPad/.test(ua)) uploadSource = 'iOS';
    else if (/Android/.test(ua)) uploadSource = 'Android';
    else if (/Linux/.test(ua)) uploadSource = 'Linux';

    const fileMeta = {
      id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7),
      originalName: req.file.originalname,
      savedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      createdAt: new Date().toISOString(),
      uploadSource,
      absolutePath: relativePath || null
    };

    const contentType = req.body.contentType || 'gallery';
    const isMedia = (req.file.mimetype.startsWith('image/') || req.file.mimetype.startsWith('video/')) && contentType !== 'drive';

    if (isMedia) {
      // 1. Guardar registro inicial en la DB rápida
      stmts.insertFile.run(fileMeta);

      // Notificar al frontend que empezó la importación
      broadcastSSE('upload_started', { id: fileMeta.id, originalName: fileMeta.originalName, contentType });

      // 2. Encolar trabajo de procesamiento asíncrono
      try {
        await imageQueue.add('generate-thumbnail', {
          fileId: fileMeta.id,
          savedName: fileMeta.savedName,
          originalName: fileMeta.originalName,
          mimeType: fileMeta.mimeType,
          absolutePath: fileMeta.absolutePath
        }, { priority: 1, jobId: `thumb-${fileMeta.id}` });
      } catch (err) {
        console.error('Redis Queue Error (imageQueue):', err);
        // Fallback or just continue (it will show as processing forever, or we could delete it)
        // We'll throw to the outer catch block to reject the upload
        stmts.hardDelete.run(fileMeta.id);
        if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(503).json({ error: 'Service Unavailable (Queue Error)' });
        return;
      }

      // Si se subió desde la pestaña de Archivos o como parte de una carpeta mixta, guardarlo en Documentos también
      if (sourceTab === 'archivos' || relativePath || targetFolderId) {
        const ext = path.extname(req.file.originalname).substring(1) || 'file';
        docDb.prepare(`
          INSERT INTO docs (id, name, savedName, extension, mimeType, size, absolutePath, clusterId, createdAt, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'READY')
        `).run(fileMeta.id + '-doc', fileMeta.originalName, fileMeta.savedName, ext, fileMeta.mimeType, fileMeta.size, null, finalClusterId, fileMeta.createdAt);
      }

      res.status(202).json({
        ...fileMeta,
        status: 'PROCESSING',
        message: 'Upload accepted, processing media in background'
      });
    } else {
      // Procesar documento
      const ext = path.extname(req.file.originalname).substring(1) || 'file';
      docDb.prepare(`
        INSERT INTO docs (id, name, savedName, extension, mimeType, size, absolutePath, clusterId, createdAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING')
      `).run(fileMeta.id, fileMeta.originalName, fileMeta.savedName, ext, fileMeta.mimeType, fileMeta.size, null, finalClusterId, fileMeta.createdAt);

      try {
        await docQueue.add('process-doc', { id: fileMeta.id }, { jobId: fileMeta.id });
      } catch (err) {
        console.error('Redis Queue Error (docQueue):', err);
        docDb.prepare(`DELETE FROM docs WHERE id = ?`).run(fileMeta.id);
        if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(503).json({ error: 'Service Unavailable (Queue Error)' });
        return;
      }
      
      broadcastSSE('upload_started', { id: fileMeta.id, originalName: fileMeta.originalName, contentType });
      res.status(202).json({
        ...fileMeta,
        status: 'PROCESSING',
        message: 'Document accepted, clustering in background'
      });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /api/documents
app.get('/api/documents', (_req: Request, res: Response) => {
  try {
    // Retornar todos los documentos no eliminados de la base de datos de Archivos
    const docs = docDb.prepare(`
      SELECT * FROM docs 
      WHERE isDeleted = 0 OR isDeleted IS NULL
      ORDER BY createdAt DESC
    `).all();
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/documents/clusters (Renombrado conceptualmente a carpetas)
app.get('/api/documents/clusters', (_req: Request, res: Response) => {
  try {
    const clusters = docDb.prepare(`SELECT * FROM doc_clusters WHERE deletedAt IS NULL ORDER BY createdAt DESC`).all();
    res.json(clusters);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/documents/folders
app.post('/api/documents/folders', (req: Request, res: Response) => {
  try {
    const { name, parentId } = req.body;
    const id = 'f-' + Date.now().toString();
    docDb.prepare(`
      INSERT INTO doc_clusters (id, name, description, createdAt, parentId)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, 'Carpeta', new Date().toISOString(), parentId || null);
    res.json({ id, name, parentId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// PUT /api/documents/folders/:id
app.put('/api/documents/folders/:id', (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    docDb.prepare(`UPDATE doc_clusters SET name = ? WHERE id = ?`).run(name, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to rename folder' });
  }
});

// DELETE /api/documents/folders/:id
app.delete('/api/documents/folders/:id', (req: Request, res: Response) => {
  try {
    const folderId = req.params.id;
    const now = new Date().toISOString();
    // Soft-delete all documents inside this folder
    docDb.prepare(`UPDATE docs SET isDeleted = 1, deletedAt = ? WHERE clusterId = ? AND (isDeleted = 0 OR isDeleted IS NULL)`).run(now, folderId);
    // Soft-delete the folder itself (keep it in the DB so we can show it in trash)
    docDb.prepare(`UPDATE doc_clusters SET deletedAt = ? WHERE id = ?`).run(now, folderId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// PUT /api/documents/:id/move
app.put('/api/documents/:id/move', (req: Request, res: Response) => {
  try {
    const { folderId } = req.body; // clusterId
    docDb.prepare(`UPDATE docs SET clusterId = ? WHERE id = ?`).run(folderId || null, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to move document' });
  }
});

// DELETE /api/documents/:id (Soft Delete)
app.delete('/api/documents/:id', (req: Request, res: Response) => {
  try {
    const doc = docDb.prepare(`SELECT * FROM docs WHERE id = ?`).get(req.params.id) as any;
    if (doc) {
      docDb.prepare(`UPDATE docs SET isDeleted = 1, deletedAt = ? WHERE id = ?`).run(new Date().toISOString(), req.params.id);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// GET /api/documents/trash
app.get('/api/documents/trash', (_req: Request, res: Response) => {
  try {
    const docs = docDb.prepare(`
      SELECT *, 'document' as itemType FROM docs 
      WHERE isDeleted = 1
      ORDER BY deletedAt DESC
    `).all();
    const folders = docDb.prepare(`
      SELECT *, 'folder' as itemType FROM doc_clusters
      WHERE deletedAt IS NOT NULL
      ORDER BY deletedAt DESC
    `).all();
    res.json({ documents: docs, folders });
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/documents/trash/restore
app.post('/api/documents/trash/restore', (req: Request, res: Response) => {
  try {
    const { ids, folderIds } = req.body;
    
    // Restore individual documents
    if (ids && Array.isArray(ids)) {
      const restoreStmt = docDb.prepare(`UPDATE docs SET isDeleted = 0, deletedAt = NULL WHERE id = ?`);
      const transaction = docDb.transaction((docIds: string[]) => {
        for (const id of docIds) {
          restoreStmt.run(id);
        }
      });
      transaction(ids);
    }
    
    // Restore folders and their contents
    if (folderIds && Array.isArray(folderIds)) {
      const restoreFolderStmt = docDb.prepare(`UPDATE doc_clusters SET deletedAt = NULL WHERE id = ?`);
      const restoreDocsInFolder = docDb.prepare(`UPDATE docs SET isDeleted = 0, deletedAt = NULL WHERE clusterId = ?`);
      const transaction = docDb.transaction((fIds: string[]) => {
        for (const id of fIds) {
          restoreFolderStmt.run(id);
          restoreDocsInFolder.run(id);
        }
      });
      transaction(folderIds);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to restore documents' });
  }
});

// DELETE /api/documents/trash/empty
app.delete('/api/documents/trash/empty', (req: Request, res: Response) => {
  try {
    const { ids, folderIds } = req.body; // opcional: si se mandan ids específicos, solo borra esos
    
    // Permanently delete specific documents or all
    let docsToDelete: any[] = [];
    if (ids && Array.isArray(ids)) {
      const getStmt = docDb.prepare(`SELECT * FROM docs WHERE id = ? AND isDeleted = 1`);
      docsToDelete = ids.map(id => getStmt.get(id)).filter(Boolean);
    } else if (!folderIds) {
      docsToDelete = docDb.prepare(`SELECT * FROM docs WHERE isDeleted = 1`).all();
    }
    
    const deleteStmt = docDb.prepare(`DELETE FROM docs WHERE id = ?`);
    
    for (const doc of docsToDelete) {
      deleteStmt.run(doc.id);
      try {
        if (doc.savedName) fs.unlinkSync(path.join(absoluteStoragePath, doc.savedName));
      } catch (err) {
        console.error('Failed to delete file from disk', err);
      }
    }
    
    // Permanently delete folders
    if (folderIds && Array.isArray(folderIds)) {
      for (const fId of folderIds) {
        // Also permanently delete documents still linked to this folder
        const folderDocs: any[] = docDb.prepare(`SELECT * FROM docs WHERE clusterId = ? AND isDeleted = 1`).all(fId);
        for (const doc of folderDocs) {
          deleteStmt.run(doc.id);
          try {
            if (doc.savedName) fs.unlinkSync(path.join(absoluteStoragePath, doc.savedName));
          } catch (err) {}
        }
        docDb.prepare(`DELETE FROM doc_clusters WHERE id = ?`).run(fId);
      }
    } else if (!ids) {
      // Empty all: also delete all soft-deleted folders
      const deletedFolders: any[] = docDb.prepare(`SELECT id FROM doc_clusters WHERE deletedAt IS NOT NULL`).all();
      for (const f of deletedFolders) {
        docDb.prepare(`DELETE FROM doc_clusters WHERE id = ?`).run(f.id);
      }
    }
    
    res.json({ success: true, count: docsToDelete.length });
  } catch (e) {
    res.status(500).json({ error: 'Failed to empty trash' });
  }
});

// POST /api/scan-local
app.post('/api/scan-local', async (req: Request, res: Response): Promise<void> => {
  let { directoryPath, contentType } = req.body;
  contentType = contentType || 'gallery';
  
  // Clean up quotes if user accidentally pasted them
  if (directoryPath) {
    directoryPath = directoryPath.replace(/^["']|["']$/g, '').trim();
    directoryPath = path.resolve(directoryPath);
  }

  if (directoryPath.startsWith('~')) {
    const os = require('os');
    directoryPath = path.join(os.homedir(), directoryPath.slice(1));
  }

  console.log('[Scan] Requested path:', directoryPath);

  try {
    if (!directoryPath || !fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
      console.error('[Scan] Invalid directory:', directoryPath);
      res.status(400).json({ error: 'Directorio inválido o no encontrado: ' + directoryPath });
      return;
    }
  } catch (err: any) {
    console.error('[Scan] Error reading directory stat:', err);
    res.status(400).json({ error: 'Error de permisos o lectura al acceder al directorio: ' + directoryPath + ' - ' + err.message });
    return;
  }

  try {
    const walkAsync = async (dir: string, filelist: string[] = []): Promise<string[]> => {
      const files = await fs.promises.readdir(dir);
      for (const file of files) {
        const filepath = path.join(dir, file);
        const stat = await fs.promises.stat(filepath);
        if (stat.isDirectory()) {
          filelist = await walkAsync(filepath, filelist);
        } else {
          filelist.push(filepath);
        }
      }
      return filelist;
    };

    const files = await walkAsync(directoryPath);
    // Filtrar solo los soportados para saber el total antes de procesar
    const supportedFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.jpg','.jpeg','.png','.webp','.heic','.heif','.mp4','.mov','.webm','.avi',
              '.pdf','.txt','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.csv','.md'].includes(ext);
    });

    const total = supportedFiles.length;
    let queued = 0;

    // Avisar al cliente cuántos archivos hay en total para la barra de progreso
    broadcastSSE('scan_start', { total, directoryPath, contentType });

    for (const filePath of supportedFiles) {
      const ext = path.extname(filePath).toLowerCase();
      const isMedia = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.mp4', '.mov', '.webm', '.avi'].includes(ext) && contentType !== 'drive';
      const isDoc = ['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.md'].includes(ext) || (!isMedia);

      const stat = fs.statSync(filePath);
      const originalName = path.basename(filePath);
      const fileId = Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7);
      const savedName = fileId + ext;

      if (isMedia) {
        let mimeType = 'application/octet-stream';
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';
        else if (ext === '.heic') mimeType = 'image/heic';
        else if (ext === '.mp4') mimeType = 'video/mp4';
        else if (ext === '.mov') mimeType = 'video/quicktime';
        else if (ext === '.webm') mimeType = 'video/webm';

        const fileMeta = {
          id: fileId,
          originalName: originalName,
          savedName: savedName,
          mimeType,
          size: stat.size,
          createdAt: new Date().toISOString(),
          uploadSource: 'Directorio Local',
          absolutePath: filePath
        };

        stmts.insertFile.run(fileMeta);
        broadcastSSE('upload_started', { id: fileMeta.id, originalName: fileMeta.originalName, queued: queued + 1, total, contentType });

        try {
          await imageQueue.add('generate-thumbnail', {
            fileId: fileMeta.id,
            savedName: fileMeta.savedName,
            originalName: fileMeta.originalName,
            mimeType: fileMeta.mimeType,
            absolutePath: fileMeta.absolutePath
          }, { priority: 1, jobId: `thumb-${fileMeta.id}` });
        } catch (err) {
          console.error('Queue Error during scan:', err);
          stmts.hardDelete.run(fileMeta.id);
          continue;
        }
      } else {
        let mimeType = 'application/octet-stream';
        if (ext === '.pdf') mimeType = 'application/pdf';
        else if (ext === '.txt' || ext === '.md' || ext === '.csv') mimeType = 'text/plain';
        else if (ext === '.doc' || ext === '.docx') mimeType = 'application/msword';
        else if (ext === '.xls' || ext === '.xlsx') mimeType = 'application/vnd.ms-excel';
        else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';
        else if (ext === '.mp4') mimeType = 'video/mp4';
        else if (ext === '.mov') mimeType = 'video/quicktime';

        let finalClusterId = null;
        if (contentType === 'drive') {
          const parentDir = path.dirname(directoryPath);
          const relativePath = path.relative(parentDir, filePath).replace(/\\/g, '/');
          finalClusterId = resolveFoldersTransaction(relativePath, null);
        }

        docDb.prepare(`
          INSERT INTO docs (id, name, savedName, extension, mimeType, size, absolutePath, clusterId, createdAt, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING')
        `).run(fileId, originalName, savedName, ext.substring(1) || 'file', mimeType, stat.size, filePath, finalClusterId, new Date().toISOString());

        try {
          await docQueue.add('process-doc', { id: fileId, absolutePath: filePath }, { jobId: fileId });
        } catch (err) {
          console.error('Queue Error during doc scan:', err);
          docDb.prepare(`DELETE FROM docs WHERE id = ?`).run(fileId);
          continue;
        }

        broadcastSSE('upload_started', { id: fileId, originalName: originalName, queued: queued + 1, total, contentType });
      }
      
      queued++;
      broadcastSSE('scan_progress', { queued, total, contentType });
    }

    broadcastSSE('scan_done', { total, queued, contentType });
    res.json({ success: true, filesQueued: queued, total, message: `Queued ${queued} files for indexing` });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ error: 'Failed to scan directory' });
  }
});

// POST /api/index-file
app.post('/api/index-file', async (req: Request, res: Response): Promise<void> => {
  let { absolutePath, contentType } = req.body;
  contentType = contentType || 'gallery';
  if (!absolutePath) {
    res.status(400).json({ error: 'Falta la ruta absoluta (absolutePath)' });
    return;
  }

  // Clean up quotes
  absolutePath = absolutePath.replace(/^["']|["']$/g, '').trim();

  try {
    if (!fs.existsSync(absolutePath)) {
      res.status(404).json({ error: 'Archivo no encontrado' });
      return;
    }
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      res.status(400).json({ error: 'Es un directorio, no un archivo' });
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const isMedia = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.mp4', '.mov', '.webm', '.avi'].includes(ext) && contentType !== 'drive';
    const isDoc = ['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.md'].includes(ext) || (!isMedia);

    if (!isMedia && !isDoc) {
      res.status(400).json({ error: 'Tipo de archivo no soportado para indexación' });
      return;
    }

    const originalName = path.basename(absolutePath);
    const fileId = Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7);
    const savedName = fileId + ext;

    if (isMedia) {
      let mimeType = 'application/octet-stream';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.heic') mimeType = 'image/heic';
      else if (ext === '.mp4') mimeType = 'video/mp4';
      else if (ext === '.mov') mimeType = 'video/quicktime';
      else if (ext === '.webm') mimeType = 'video/webm';

      const fileMeta = {
        id: fileId,
        originalName,
        savedName,
        mimeType,
        size: stat.size,
        createdAt: new Date().toISOString(),
        uploadSource: 'Directorio Local (Live)',
        absolutePath
      };

      stmts.insertFile.run(fileMeta);
      broadcastSSE('upload_started', { id: fileMeta.id, originalName: fileMeta.originalName, contentType });

      await imageQueue.add('generate-thumbnail', {
        fileId: fileMeta.id,
        savedName: fileMeta.savedName,
        originalName: fileMeta.originalName,
        mimeType: fileMeta.mimeType,
        absolutePath: fileMeta.absolutePath
      }, { priority: 1, jobId: `thumb-${fileMeta.id}` });
    } else {
      let mimeType = 'application/octet-stream';
      if (ext === '.pdf') mimeType = 'application/pdf';
      else if (ext === '.txt' || ext === '.md' || ext === '.csv') mimeType = 'text/plain';
      else if (ext === '.doc' || ext === '.docx') mimeType = 'application/msword';
      else if (ext === '.xls' || ext === '.xlsx') mimeType = 'application/vnd.ms-excel';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.mp4') mimeType = 'video/mp4';
      else if (ext === '.mov') mimeType = 'video/quicktime';

      docDb.prepare(`
        INSERT INTO docs (id, name, savedName, extension, mimeType, size, absolutePath, clusterId, createdAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING')
      `).run(fileId, originalName, savedName, ext.substring(1) || 'file', mimeType, stat.size, absolutePath, null, new Date().toISOString());

      await docQueue.add('process-doc', { id: fileId, absolutePath }, { jobId: fileId });
    }

    res.json({ success: true, message: 'Archivo indexado exitosamente' });
  } catch (error) {
    console.error('Index file error:', error);
    res.status(500).json({ error: 'Error al indexar archivo individual' });
  }
});


// GET /api/files
app.get('/api/files', (_req: Request, res: Response) => {
  try {
    const files = stmts.getFiles.all();
    res.json(files);
  } catch (error) {
    console.error('Fetch files error:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// DELETE /api/files/:id  (soft delete → trash)
app.delete('/api/files/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  try {
    const result = stmts.softDelete.run(new Date().toISOString(), id);
    if (result.changes > 0) { res.json({ success: true }); return; }
    res.status(404).json({ error: 'File not found' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// GET /api/search
app.get('/api/search', async (req: Request, res: Response): Promise<void> => {
  const rawQuery = req.query.q as string;
  if (!rawQuery) { res.json([]); return; }
  if (!tokenizer || !textModel) { res.status(503).json({ error: 'AI models loading...' }); return; }

  try {
    let query = rawQuery;
    try {
      query = await translate(rawQuery, { from: 'es', to: 'en' });
      console.log(`[Search] "${rawQuery}" -> "${query}"`);
    } catch (_) {}

    // Prefix with "a photo of a" for better CLIP alignment
    const clipQuery = `a photo of a ${query}`;
    const inputs = tokenizer([clipQuery]);
    const output = await textModel(inputs);
    const queryEmbedding = Array.from(output.text_embeds.data) as number[];

    const filesWithEmbedding = stmts.getFilesWithEmbedding.all() as any[];
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
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/trash
app.get('/api/trash', (_req: Request, res: Response) => {
  try {
    res.json(stmts.getTrash.all());
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trash' });
  }
});

// PUT /api/trash/:id/restore
app.put('/api/trash/:id/restore', (req: Request, res: Response): void => {
  const { id } = req.params;
  try {
    const result = stmts.restore.run(id);
    if (result.changes > 0) { res.json({ success: true }); return; }
    res.status(404).json({ error: 'File not found in trash' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore file' });
  }
});

// DELETE /api/trash/:id  (hard delete)
app.delete('/api/trash/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  try {
    const file = stmts.getFileById.get(id) as any;
    if (!file || !file.isDeleted) { res.status(404).json({ error: 'File not found in trash' }); return; }
    
    // Delete main file
    if (file.savedName) {
      const filePath = path.join(absoluteStoragePath, file.savedName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    
    // Delete thumbnail
    if (file.thumbnailName) {
      const thumbPath = path.join(absoluteStoragePath, file.thumbnailName);
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    }
    
    stmts.hardDelete.run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Hard delete error:', error);
    res.status(500).json({ error: 'Failed to delete file permanently' });
  }
});

// GET /api/duplicates (Archivos idénticos basados en tamaño y hash/blurhash)
app.get('/api/duplicates', (req: Request, res: Response) => {
  try {
    const files = stmts.getFiles.all() as any[];
    // Group files by size and blurhash (extremely reliable fingerprint for identical files)
    const groups = new Map<string, any[]>();
    for (const f of files) {
      if (!f.size || !f.blurhash) continue;
      const key = `${f.size}-${f.blurhash}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }
    const duplicateGroups = Array.from(groups.values()).filter(g => g.length > 1);
    res.json(duplicateGroups);
  } catch (error) {
    console.error('Failed to fetch duplicates:', error);
    res.status(500).json({ error: 'Failed to fetch duplicates' });
  }
});

// GET /api/similars (Archivos similares basados en IA)
app.get('/api/similars', (req: Request, res: Response) => {
  try {
    const threshold = parseFloat(req.query.threshold as string) || 0.85;
    const files = stmts.getFilesWithEmbedding.all() as any[];
    const parsedFiles = files.map(f => ({ ...f, vec: JSON.parse(f.embedding) as number[] }));
    
    const groups: any[][] = [];
    const visited = new Set<string>();

    for (let i = 0; i < parsedFiles.length; i++) {
      const f1 = parsedFiles[i];
      if (visited.has(f1.id)) continue;

      const currentGroup = [f1];
      visited.add(f1.id);

      for (let j = i + 1; j < parsedFiles.length; j++) {
        const f2 = parsedFiles[j];
        if (visited.has(f2.id)) continue;
        
        const sim = cosineSimilarity(f1.vec, f2.vec);
        // Umbral dinámico para capturar mejor las ráfagas o fotos muy parecidas de la misma escena
        if (sim > threshold) {   
          currentGroup.push(f2);
          visited.add(f2.id);
        }
      }
      if (currentGroup.length > 1) groups.push(currentGroup);
    }
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch similars' });
  }
});

// GET /api/albums
app.get('/api/albums', (_req: Request, res: Response) => {
  try {
    const albums = stmts.getAlbums.all() as any[];
    const albumsWithCount = albums.map(album => {
      const files = stmts.getAlbumFiles.all(album.id, album.id, album.id, album.id) as any[];
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
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
});

// GET /api/albums/:id
app.get('/api/albums/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  try {
    const album = stmts.getAlbumById.get(id) as any;
    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }
    const files = stmts.getAlbumFiles.all(id, id, id, id) as any[];
    res.json({
      ...album,
      photoCount: files.length,
      coverUrl: files[0] ? `/uploads/${files[0].savedName}` : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch album' });
  }
});

// GET /api/albums/:id/files
app.get('/api/albums/:id/files', (req: Request, res: Response): void => {
  const { id } = req.params;
  try {
    const files = stmts.getAlbumFiles.all(id, id, id, id) as any[];
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch album files' });
  }
});

// GET /api/albums/:id/people
app.get('/api/albums/:id/people', (req: Request, res: Response): void => {
  const { id } = req.params;
  try {
    const people = stmts.getAlbumPeople.all(id) as any[];
    res.json(people.map(p => p.personId));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch album people' });
  }
});

// PUT /api/albums/:id/people
app.put('/api/albums/:id/people', (req: Request, res: Response): void => {
  const { id } = req.params;
  const { personIds } = req.body;
  try {
    const updatePeople = db.transaction((albumId: string, pIds: string[]) => {
      stmts.deleteAlbumPeople.run(albumId);
      if (pIds && Array.isArray(pIds)) {
        for (const personId of pIds) {
          stmts.addPersonToAlbum.run(albumId, personId);
        }
      }
    });
    updatePeople(id as string, personIds || []);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update album people:', error);
    res.status(500).json({ error: 'Failed to update album people' });
  }
});

// POST /api/albums
app.post('/api/albums', (req: Request, res: Response): void => {
  const { name, description, fileIds, personIds } = req.body;
  try {
    const newAlbum = { 
      id: Date.now().toString(), 
      name, 
      description: description ?? null, 
      coverUrl: null, 
      createdAt: new Date().toISOString() 
    };

    const insertAlbumAndFiles = db.transaction((album: any, ids: string[], pIds: string[]) => {
      stmts.insertAlbum.run(album);
      if (ids && Array.isArray(ids)) {
        for (const fileId of ids) {
          stmts.addFileToAlbum.run(album.id, fileId);
        }
      }
      if (pIds && Array.isArray(pIds)) {
        for (const personId of pIds) {
          stmts.addPersonToAlbum.run(album.id, personId);
        }
      }
    });

    insertAlbumAndFiles(newAlbum, fileIds || [], personIds || []);

    res.status(201).json(newAlbum);
  } catch (error) {
    console.error('Failed to create album:', error);
    res.status(500).json({ error: 'Failed to create album' });
  }
});

// PUT /api/albums/:id/add
app.put('/api/albums/:id/add', (req: Request, res: Response): void => {
  const { id } = req.params;
  const { fileIds } = req.body as { fileIds: string[] };
  try {
    const addMany = db.transaction((ids: string[]) => {
      for (const fileId of ids) stmts.addFileToAlbum.run(id, fileId);
    });
    addMany(fileIds || []);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update album' });
  }
});

// PUT /api/albums/:id
app.put('/api/albums/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || name.trim() === '') {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  try {
    const result = stmts.updateAlbumName.run(name.trim(), id);
    if (result.changes > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Album not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to rename album' });
  }
});

// DELETE /api/albums/:id
app.delete('/api/albums/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  try {
    const result = stmts.deleteAlbum.run(id);
    if (result.changes > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Album not found' });
    }
  } catch (error) {
    console.error('Delete album error:', error);
    res.status(500).json({ error: 'Failed to delete album' });
  }
});

// PUT /api/files/:id/favorite
app.put('/api/files/:id/favorite', (req: Request, res: Response): void => {
  const { id } = req.params;
  try {
    const file = stmts.getFileById.get(id) as any;
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    
    const newStatus = file.isFavorite ? 0 : 1;
    
    const toggleFav = db.transaction(() => {
      db.prepare(`UPDATE files SET isFavorite = ? WHERE id = ?`).run(newStatus, id);
      
      // Ensure "Favoritas" album exists
      let favAlbum = db.prepare(`SELECT * FROM albums WHERE name = 'Favoritas' COLLATE NOCASE`).get() as any;
      if (!favAlbum) {
        favAlbum = { id: Date.now().toString(), name: 'Favoritas', description: null, coverUrl: null, createdAt: new Date().toISOString() };
        stmts.insertAlbum.run(favAlbum);
      }
      
      if (newStatus === 1) {
        stmts.addFileToAlbum.run(favAlbum.id, id);
      } else {
        stmts.removeFileFromAlbum.run(favAlbum.id, id);
      }
    });
    
    toggleFav();
    res.json({ isFavorite: newStatus === 1 });
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// DELETE /api/albums/:id/files
app.delete('/api/albums/:id/files', (req: Request, res: Response): void => {
  const { id } = req.params;
  const { fileIds } = req.body;

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    res.status(400).json({ error: 'fileIds must be a non-empty array' });
    return;
  }

  try {
    const deleteMany = db.transaction((files: string[]) => {
      let count = 0;
      for (const fileId of files) {
        const result = stmts.removeFileFromAlbum.run(id, fileId);
        count += result.changes;
      }
      return count;
    });

    const removedCount = deleteMany(fileIds);
    res.json({ success: true, removedCount });
  } catch (error) {
    console.error('Error removing files from album:', error);
    res.status(500).json({ error: 'Failed to remove files from album' });
  }
});

// POST /api/analyze-faces
app.post('/api/analyze-faces', async (req: Request, res: Response): Promise<void> => {
  const { fileId } = req.body;
  try {
    const file = stmts.getFileById.get(fileId) as any;
    if (!file) { res.status(404).json({ error: 'File not found' }); return; }
    const filePath = path.join(absoluteStoragePath, file.savedName);
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:8000';
    const pythonRes = await fetch(`${pythonApiUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagePath: filePath })
    });
    if (pythonRes.ok) {
      const data = await pythonRes.json();
      stmts.updateFaces.run(JSON.stringify(data.faces), fileId);
      res.json(data);
      return;
    }
    res.status(pythonRes.status).json({ error: 'Python microservice error' });
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to connect to Python AI' });
  }
});

app.get('/api/people/status', (req, res) => {
  try {
    const totalRow = db.prepare(`SELECT COUNT(*) as count FROM files WHERE mimeType LIKE 'image/%' AND isDeleted = 0`).get() as {count: number};
    const processedRow = db.prepare(`SELECT COUNT(*) as count FROM files WHERE mimeType LIKE 'image/%' AND status = 'READY' AND isDeleted = 0`).get() as {count: number};
    res.json({ total: totalRow.count, processed: processedRow.count });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/people', (req, res) => {
  try {
    const people = db.prepare(`
      SELECT p.id, p.name, f.savedName as coverFile, f.thumbnailName as coverThumbnail, f.blurhash as coverBlurhash,
             COUNT(DISTINCT ff.fileId) as faceCount 
      FROM people p 
      INNER JOIN file_faces ff ON p.id = ff.personId 
      INNER JOIN files ff_file ON ff.fileId = ff_file.id AND ff_file.isDeleted = 0
      LEFT JOIN files f ON p.coverFileId = f.id 
      WHERE p.isHidden = 0
      GROUP BY p.id 
      HAVING faceCount > 0
      ORDER BY faceCount DESC
    `).all();
    res.json(people);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/people/:id', (req, res) => {
  try {
    db.prepare('UPDATE people SET name = ? WHERE id = ?').run(req.body.name, req.params.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/people/:id/hide', (req, res) => {
  try {
    db.prepare('UPDATE people SET isHidden = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Failed' });
  }
});

app.put('/api/people/:id/cover', (req, res) => {
  try {
    console.log(`[Cover API] Setting cover for ${req.params.id} to ${req.body.fileId}`);
    db.prepare('UPDATE people SET coverFileId = ? WHERE id = ?').run(req.body.fileId, req.params.id);
    res.json({ success: true });
  } catch(e) {
    console.error('[Cover API] Error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/people/:id/face', async (req, res) => {
  try {
    const personId = req.params.id;
    let faceRow = db.prepare(`
      SELECT ff.boxX, ff.boxY, ff.boxW, ff.boxH, f.thumbnailName, f.savedName
      FROM people p
      JOIN file_faces ff ON p.id = ff.personId AND p.coverFileId = ff.fileId
      JOIN files f ON ff.fileId = f.id
      WHERE p.id = ?
    `).get(personId) as any;

    console.log(`[Face API] Fetching face for person ${personId}. Cover face found: ${!!faceRow}`);

    if (!faceRow) {
      faceRow = db.prepare(`
        SELECT ff.boxX, ff.boxY, ff.boxW, ff.boxH, f.thumbnailName, f.savedName
        FROM file_faces ff
        JOIN files f ON ff.fileId = f.id
        WHERE ff.personId = ?
        LIMIT 1
      `).get(personId) as any;
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

    const imagePath = path.join(absoluteStoragePath, imageToUse);
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'Image file not found' });
    }

    const metadata = await sharp(imagePath).metadata();
    
    let left = Math.max(0, Math.floor(faceRow.boxX));
    let top = Math.max(0, Math.floor(faceRow.boxY));
    let width = Math.floor(faceRow.boxW);
    let height = Math.floor(faceRow.boxH);
    
    const paddingX = Math.floor(width * 0.4);
    const paddingY = Math.floor(height * 0.4);
    
    left = Math.max(0, left - paddingX);
    top = Math.max(0, top - paddingY);
    width = Math.min(metadata.width! - left, width + paddingX * 2);
    height = Math.min(metadata.height! - top, height + paddingY * 2);

    const buffer = await sharp(imagePath)
      .extract({ left, top, width, height })
      .resize(200, 200, { fit: 'cover' })
      .jpeg({ quality: 90 })
      .toBuffer();

    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
  } catch (error) {
    console.error('Error generating face thumbnail:', error);
    res.status(500).json({ error: 'Failed to generate face thumbnail' });
  }
});

app.get('/api/files/:id/people', (req, res) => {
  try {
    const people = db.prepare(`
      SELECT p.id, p.name, p.coverFileId
      FROM file_faces ff
      JOIN people p ON ff.personId = p.id
      WHERE ff.fileId = ? AND p.isHidden = 0
      GROUP BY p.id
    `).all(req.params.id);
    res.json(people);
  } catch (err) {
    console.error('Error fetching file people:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/people/:id/photos', (req, res) => {
  try {
    const alsoWith = req.query.alsoWith as string;
    let files;
    if (alsoWith) {
      const ids = [req.params.id, ...alsoWith.split(',')];
      const placeholders = ids.map(() => '?').join(',');
      files = db.prepare(`
        SELECT f.*
        FROM files f
        JOIN file_faces ff ON f.id = ff.fileId
        WHERE ff.personId IN (${placeholders}) AND f.isDeleted = 0
        GROUP BY f.id
        HAVING COUNT(DISTINCT ff.personId) = ?
        ORDER BY COALESCE(f.takenAt, f.createdAt) DESC
      `).all(...ids, ids.length);
    } else {
      files = db.prepare(`
        SELECT DISTINCT f.* FROM files f
        JOIN file_faces ff ON f.id = ff.fileId
        WHERE ff.personId = ? AND f.isDeleted = 0
        ORDER BY COALESCE(f.takenAt, f.createdAt) DESC
      `).all(req.params.id);
    }
    res.json(files);
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/people/:id/co-occurring', (req, res) => {
  try {
    const alsoWith = req.query.alsoWith as string;
    const ids = alsoWith ? [req.params.id, ...alsoWith.split(',')] : [req.params.id];
    const placeholders = ids.map(() => '?').join(',');

    const coOccurring = db.prepare(`
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
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/people/merge', (req, res) => {
  try {
    const { personIds } = req.body as { personIds: string[] };
    if (!personIds || personIds.length < 2) {
      return res.status(400).json({ error: 'Requires at least 2 person IDs' });
    }

    const people = personIds.map(id => db.prepare('SELECT * FROM people WHERE id = ?').get(id) as any).filter(Boolean);
    if (people.length < 2) {
      return res.status(400).json({ error: 'Invalid person IDs' });
    }

    let targetId = people[0].id;
    const namedPerson = people.find(p => p.name && p.name !== 'Desconocido');
    if (namedPerson) {
      targetId = namedPerson.id;
    }

    const sourceIds = personIds.filter(id => id !== targetId);

    const mergeTx = db.transaction(() => {
      for (const src of sourceIds) {
        db.prepare('UPDATE file_faces SET personId = ? WHERE personId = ?').run(targetId, src);
        db.prepare('DELETE FROM people WHERE id = ?').run(src);
      }
    });
    
    mergeTx();
    res.json({ success: true, targetId });
  } catch (error) {
    console.error('Error merging people:', error);
    res.status(500).json({ error: 'Failed to merge people' });
  }
});

app.post('/api/people/:id/remove-photos', (req, res) => {
  try {
    const { id } = req.params;
    const { fileIds } = req.body as { fileIds: string[] };
    
    if (!fileIds || !fileIds.length) {
      return res.status(400).json({ error: 'No files specified' });
    }

    const placeholders = fileIds.map(() => '?').join(',');
    
    const removeTx = db.transaction(() => {
      db.prepare(`DELETE FROM file_faces WHERE personId = ? AND fileId IN (${placeholders})`).run(id, ...fileIds);
      
      const remainingFaces = db.prepare('SELECT COUNT(*) as count FROM file_faces WHERE personId = ?').get(id) as {count: number};
      if (remainingFaces.count === 0) {
        db.prepare('DELETE FROM people WHERE id = ?').run(id);
      }
    });

    removeTx();
    res.json({ success: true });
  } catch (error) {
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
    
    const filesToDelete = db.prepare(`SELECT id, savedName, thumbnailName FROM files WHERE isDeleted = 1 AND deletedAt <= ?`).all(dateStr) as any[];
    
    if (filesToDelete.length > 0) {
      console.log(`🧹 Auto-deleting ${filesToDelete.length} files from trash (older than 60 days)...`);
      filesToDelete.forEach(f => {
        try {
          if (fs.existsSync(path.join(absoluteStoragePath, f.savedName))) {
            fs.unlinkSync(path.join(absoluteStoragePath, f.savedName));
          }
          if (f.thumbnailName && fs.existsSync(path.join(absoluteStoragePath, f.thumbnailName))) {
            fs.unlinkSync(path.join(absoluteStoragePath, f.thumbnailName));
          }
        } catch (e) {
          console.error(`Failed to delete physical file for ${f.id}`, e);
        }
        stmts.hardDelete.run(f.id);
      });
    }

    const docsToDelete = docDb.prepare(`SELECT id, savedName, thumbnailName FROM docs WHERE isDeleted = 1 AND deletedAt <= ?`).all(dateStr) as any[];
    
    if (docsToDelete.length > 0) {
      console.log(`🧹 Auto-deleting ${docsToDelete.length} documents from trash (older than 60 days)...`);
      docsToDelete.forEach(f => {
        try {
          if (f.savedName && fs.existsSync(path.join(absoluteStoragePath, f.savedName))) {
            fs.unlinkSync(path.join(absoluteStoragePath, f.savedName));
          }
          if (f.thumbnailName && fs.existsSync(path.join(absoluteStoragePath, f.thumbnailName))) {
            fs.unlinkSync(path.join(absoluteStoragePath, f.thumbnailName));
          }
        } catch (e) {
          console.error(`Failed to delete physical document for ${f.id}`, e);
        }
        docDb.prepare('DELETE FROM docs WHERE id = ?').run(f.id);
      });
    }
  } catch (error) {
    console.error('Error in cleanupTrash:', error);
  }
};

// Run on startup and every hour
cleanupTrash();
setInterval(cleanupTrash, 60 * 60 * 1000);

app.listen(port, () => {
  console.log(`✅ Server running on port ${port} — SQLite DB: ${dbPath}`);
});
