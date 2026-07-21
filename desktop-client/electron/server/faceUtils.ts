/**
 * faceUtils.ts
 * Manages a persistent Worker Thread for face detection.
 * - TensorFlow runs in a separate thread → main event loop NEVER blocks
 * - If a photo hangs, the worker is killed with worker.terminate() after 60s
 * - Worker restarts automatically on next call
 */
import { Worker } from 'worker_threads';
import path from 'path';

let worker: Worker | null = null;
let workerReady = false;
const pendingRequests = new Map<string, { resolve: (r: any[]) => void; timer: NodeJS.Timeout }>();
let counter = 0;

const MODEL_PATH = path.resolve(__dirname, '..', 'node_modules', '@vladmandic', 'face-api', 'model');
const WORKER_PATH = path.resolve(__dirname, 'faceWorker.js');
const TIMEOUT_MS = 60_000; // 60 seconds per photo

function spawnWorker(): Worker {
  const w = new Worker(WORKER_PATH, { workerData: { modelPath: MODEL_PATH } });

  w.on('message', (msg: any) => {
    if (msg.type === 'ready') {
      workerReady = true;
      return;
    }
    if (msg.type === 'result') {
      const pending = pendingRequests.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRequests.delete(msg.requestId);
        pending.resolve(msg.result || []);
      }
    }
  });

  w.on('error', (err) => {
    console.error('[Face Worker] Error:', err.message);
    killWorker();
  });

  w.on('exit', (code) => {
    if (code !== 0) console.error(`[Face Worker] Exited with code ${code}`);
    worker = null;
    workerReady = false;
    // Resolve any remaining pending requests with empty arrays
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve([]);
      pendingRequests.delete(id);
    }
  });

  return w;
}

function killWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
    workerReady = false;
  }
}

function getWorker(): Worker {
  if (!worker) {
    worker = spawnWorker();
  }
  return worker;
}

export async function detectFacesInImage(imagePath: string): Promise<any[]> {
  return new Promise((resolve) => {
    const requestId = String(++counter);
    const w = getWorker();

    const timer = setTimeout(() => {
      console.error(`[Face Worker] ⏰ Timeout (60s) — killing worker, skipping: ${path.basename(imagePath)}`);
      pendingRequests.delete(requestId);
      killWorker(); // Worker will be recreated on next call
      resolve([]);
    }, TIMEOUT_MS);

    pendingRequests.set(requestId, { resolve, timer });

    // Wait for worker to be ready before sending work
    if (workerReady) {
      w.postMessage({ requestId, imagePath });
    } else {
      // Poll until ready (models take a few seconds to load)
      const poll = setInterval(() => {
        if (workerReady && worker) {
          clearInterval(poll);
          worker.postMessage({ requestId, imagePath });
        }
      }, 200);
    }
  });
}
