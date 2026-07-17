import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';
import * as faceapi from '@vladmandic/face-api/dist/face-api.node-wasm.js';
import sharp from 'sharp';
import path from 'path';

let modelsLoaded = false;

export async function initFaceModels() {
  if (modelsLoaded) return;
  console.log('[Face API] Loading models...');
  
  await tf.setBackend('cpu');
  await tf.ready();

  const modelPath = path.resolve(__dirname, '..', 'node_modules', '@vladmandic', 'face-api', 'model');
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
  
  modelsLoaded = true;
  console.log('[Face API] Models loaded successfully.');
}

export async function detectFacesInImage(imagePath: string) {
  if (!modelsLoaded) await initFaceModels();

  try {
    const image = sharp(imagePath);
    const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

    // ensureAlpha makes it 4 channels (RGBA)
    // we need 3 channels (RGB) for face-api tensor
    const rgbData = new Uint8Array(info.width * info.height * 3);
    for (let i = 0; i < info.width * info.height; i++) {
      rgbData[i * 3] = data[i * 4];
      rgbData[i * 3 + 1] = data[i * 4 + 1];
      rgbData[i * 3 + 2] = data[i * 4 + 2];
    }

    const tensor = tf.tensor3d(rgbData, [info.height, info.width, 3], 'int32');
    
    const detections = await faceapi.detectAllFaces(tensor as any)
      .withFaceLandmarks()
      .withFaceDescriptors();
      
    tensor.dispose(); 

    return detections.map(d => ({
      descriptor: Array.from(d.descriptor),
      box: {
        x: d.detection.box.x,
        y: d.detection.box.y,
        width: d.detection.box.width,
        height: d.detection.box.height
      }
    }));

  } catch (error) {
    console.error('[Face API] Error detecting faces:', error);
    return [];
  }
}
