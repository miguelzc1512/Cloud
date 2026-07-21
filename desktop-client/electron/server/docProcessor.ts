import { docsDb } from "./server";
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

// Inicializamos el worker pipeline en línea
let textPipeline: any = null;
let docClustersCache: { id: string, name: string, embedding: number[] }[] | null = null;

async function initModels() {
  console.log('[Doc Worker] Loading AI Models...');
  try {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.localModelPath = './models';
    env.allowRemoteModels = true;
    textPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('[Doc Worker] AI Models loaded successfully.');
  } catch (e) {
    console.error('[Doc Worker] Error loading models:', e);
  }
}
initModels();

function getClustersCache() {
  if (!docClustersCache) {
    const existing = docsDb.prepare(`SELECT id, name, embedding FROM doc_clusters`).all() as any[];
    docClustersCache = existing.map(ec => ({
      id: ec.id,
      name: ec.name,
      embedding: JSON.parse(ec.embedding)
    }));
  }
  return docClustersCache;
}

// Helper to hash file content for deduplication
function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

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

export async function processDocument(jobData: any) {
  const { absolutePath, originalName, extension, size } = jobData;
  console.log(`[Doc Worker] Empezando a procesar ${originalName}`);

  try {
    if (!fs.existsSync(absolutePath)) {
      console.log(`[Doc Worker] Archivo no encontrado: ${absolutePath}`);
      return;
    }

    // 1. Calculate Hash
    const hash = await hashFile(absolutePath);

    // 2. Comprobar si ya existe un documento con el mismo Hash (Deduplicación)
    const exactDuplicate = docsDb.prepare(`SELECT id FROM documents WHERE hash = ? LIMIT 1`).get(hash) as any;
    if (exactDuplicate) {
      console.log(`[Doc Worker] Duplicado exacto ignorado (hash match): ${originalName}`);
      // Solo actualizamos que vimos este path y ya
      docsDb.prepare(`INSERT OR IGNORE INTO documents (id, name, extension, absolutePath, hash, size, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 'READY', ?, ?)`).run(
        crypto.randomUUID(), originalName, extension, absolutePath, hash, size, new Date().toISOString(), new Date().toISOString()
      );
      return;
    }

    // 3. Comprobar Versionado (mismo nombre exacto en diferente ruta, o nombre muy similar)
    // Buscamos si ya existe en la DB un archivo con exactamente el mismo nombre o base (ignorando extensión)
    const baseName = path.basename(originalName, extension).replace(/_v\d+$/i, '').replace(/_final$/i, '').trim();
    const similarDoc = docsDb.prepare(`SELECT id FROM documents WHERE name LIKE ? LIMIT 1`).get(`${baseName}%`) as any;

    let targetDocId = crypto.randomUUID();

    if (similarDoc) {
      targetDocId = similarDoc.id;
      // Guardar como nueva versión del documento existente
      docsDb.prepare(`
        INSERT INTO doc_versions (id, documentId, hash, size, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), targetDocId, hash, size, new Date().toISOString());
      
      // Actualizamos el documento padre con el path nuevo si es que es más reciente
      docsDb.prepare(`UPDATE documents SET absolutePath = ?, hash = ?, size = ?, updatedAt = ?, status = 'READY' WHERE id = ?`)
            .run(absolutePath, hash, size, new Date().toISOString(), targetDocId);
            
      console.log(`[Doc Worker] Guardado como versión de ${baseName}`);
      return;
    }

    // 4. Si es documento nuevo, generar contexto semántico
    // "Carpeta principal + nombre del archivo"
    const contextParts = absolutePath.split(path.sep);
    const contextString = `Archivo: ${originalName}. Ruta: ${contextParts.slice(Math.max(contextParts.length - 3, 0)).join(' ')}. Categoría: ${extension.replace('.', '')}`;
    
    let embeddingStr = null;
    let clusterId = null;

    if (textPipeline) {
      try {
        const output = await textPipeline(contextString, { pooling: 'mean', normalize: true });
        const embedding = Array.from(output.data) as number[];
        embeddingStr = JSON.stringify(embedding);

        // Buscar cluster más cercano
        const clusters = getClustersCache();
        let maxSimilarity = 0;
        let matchedClusterId = null;

        for (const cluster of clusters) {
          const sim = cosineSimilarity(embedding, cluster.embedding);
          if (sim > maxSimilarity) {
            maxSimilarity = sim;
            matchedClusterId = cluster.id;
          }
        }

        // Si la similitud es baja, crear nuevo clúster
        if (maxSimilarity < 0.7) {
          clusterId = crypto.randomUUID();
          const clusterName = baseName.substring(0, 30); // Placeholder simple para nombre de cluster
          docsDb.prepare(`INSERT INTO doc_clusters (id, name, embedding) VALUES (?, ?, ?)`).run(clusterId, clusterName, embeddingStr);
          clusters.push({ id: clusterId, name: clusterName, embedding });
        } else {
          clusterId = matchedClusterId;
        }

      } catch (e) {
        console.error('[Doc Worker] Error en embeddings semánticos', e);
      }
    }

    // 5. Guardar en Base de Datos
    docsDb.prepare(`
      INSERT INTO documents (id, name, extension, absolutePath, hash, size, status, clusterId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, 'READY', ?, ?, ?)
    `).run(targetDocId, originalName, extension, absolutePath, hash, size, clusterId, new Date().toISOString(), new Date().toISOString());

    // 6. FTS5 Indexing
    docsDb.prepare(`
      INSERT INTO documents_fts (id, name, absolutePath, content) VALUES (?, ?, ?, ?)
    `).run(targetDocId, originalName, absolutePath, contextString);

    console.log(`[Doc Worker] Finalizado con éxito ${originalName}`);

  } catch (error) {
    console.error(`[Doc Worker] Error crítico procesando ${originalName}:`, error);
  }
}
