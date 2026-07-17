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
const dbPath = path.resolve(__dirname, '..', 'nube.db');
export const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
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

  CREATE TABLE IF NOT EXISTS album_people (
    albumId TEXT NOT NULL,
    personId TEXT NOT NULL,
    PRIMARY KEY (albumId, personId),
    FOREIGN KEY (albumId) REFERENCES albums(id) ON DELETE CASCADE
  );
`);

try {
  db.exec(`ALTER TABLE files ADD COLUMN uploadSource TEXT;`);
} catch (e) {
  // column already exists
}

try {
  db.exec(`ALTER TABLE files ADD COLUMN isFavorite INTEGER DEFAULT 0;`);
} catch (e) {
  // column already exists
}

// ─── Prepared Statements (compiled once, fast always) ──────────────────────
export const stmts = {
  insertFile: db.prepare(`
    INSERT INTO files (id, originalName, savedName, mimeType, size, status, createdAt, isDeleted, uploadSource)
    VALUES (@id, @originalName, @savedName, @mimeType, @size, 'PROCESSING', @createdAt, 0, @uploadSource)
  `),
  getFiles: db.prepare(`
    SELECT id, originalName, savedName, thumbnailName, blurhash, width, height, status, mimeType, size, createdAt, takenAt, latitude, longitude, uploadSource, isFavorite
    FROM files WHERE isDeleted = 0 ORDER BY COALESCE(takenAt, createdAt) DESC
  `),
  getFilesWithEmbedding: db.prepare(`
    SELECT id, originalName, savedName, thumbnailName, blurhash, mimeType, size, createdAt, takenAt, latitude, longitude, embedding, uploadSource
    FROM files WHERE isDeleted = 0 AND embedding IS NOT NULL
  `),
  softDelete: db.prepare(`UPDATE files SET isDeleted = 1, deletedAt = ? WHERE id = ? AND isDeleted = 0`),
  getTrash: db.prepare(`
    SELECT id, originalName, savedName, thumbnailName, blurhash, mimeType, size, createdAt, takenAt, latitude, longitude, isDeleted, deletedAt, uploadSource, isFavorite
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

// POST /api/upload
app.post('/api/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

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
      uploadSource
    };

    // 1. Guardar registro inicial en la DB rápido
    stmts.insertFile.run(fileMeta);

    // Notificar al frontend que empezó la importación
    broadcastSSE('upload_started', { id: fileMeta.id, originalName: fileMeta.originalName });

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

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
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
      LEFT JOIN file_faces ff ON p.id = ff.personId 
      LEFT JOIN files f ON p.coverFileId = f.id 
      WHERE p.isHidden = 0
      GROUP BY p.id 
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
