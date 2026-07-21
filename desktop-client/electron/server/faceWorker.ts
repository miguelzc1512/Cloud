/**
 * faceWorker.ts
 * Runs inside a Node.js Worker Thread.
 * TensorFlow blocks this thread, but NOT the main event loop.
 * The main thread can call worker.terminate() to kill it at any time.
 */
import { workerData, parentPort } from 'worker_threads';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';
import * as faceapi from '@vladmandic/face-api/dist/face-api.node-wasm.js';
import sharp from 'sharp';

async function run() {
  const { modelPath } = workerData;

  // Load models once
  await tf.setBackend('cpu');
  await tf.ready();
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);

  // Signal that models are ready
  parentPort!.postMessage({ type: 'ready' });

  // Listen for detect requests
  parentPort!.on('message', async ({ requestId, imagePath }: { requestId: string; imagePath: string }) => {
    try {
      const image = sharp(imagePath);
      const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

      const rgbData = new Uint8Array(info.width * info.height * 3);
      for (let i = 0; i < info.width * info.height; i++) {
        rgbData[i * 3]     = data[i * 4];
        rgbData[i * 3 + 1] = data[i * 4 + 1];
        rgbData[i * 3 + 2] = data[i * 4 + 2];
      }

      const tensor = tf.tensor3d(rgbData, [info.height, info.width, 3], 'int32');
      const detections = await faceapi.detectAllFaces(tensor as any)
        .withFaceLandmarks()
        .withFaceDescriptors();
      tensor.dispose();

      parentPort!.postMessage({
        type: 'result',
        requestId,
        result: detections.map(d => ({
          descriptor: Array.from(d.descriptor),
          box: {
            x: d.detection.box.x,
            y: d.detection.box.y,
            width: d.detection.box.width,
            height: d.detection.box.height,
          },
        })),
      });
    } catch (err: any) {
      parentPort!.postMessage({ type: 'result', requestId, result: [], error: err.message });
    }
  });
}

run().catch(err => {
  parentPort!.postMessage({ type: 'error', error: err.message });
  process.exit(1);
});
