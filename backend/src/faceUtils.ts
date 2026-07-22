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

  let tensor: tf.Tensor3D | null = null;
  try {
    // Usar la miniatura directamente (800px) para mantener las coordenadas 100% exactas con la imagen mostrada
    const image = sharp(imagePath);
    const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

    // ensureAlpha makes it 4 channels (RGBA) -> convert to 3 channels (RGB)
    const rgbData = new Uint8Array(info.width * info.height * 3);
    for (let i = 0; i < info.width * info.height; i++) {
      rgbData[i * 3] = data[i * 4];
      rgbData[i * 3 + 1] = data[i * 4 + 1];
      rgbData[i * 3 + 2] = data[i * 4 + 2];
    }

    tensor = tf.tensor3d(rgbData, [info.height, info.width, 3], 'int32');
    
    // Usar minConfidence: 0.5 para filtrar falsos positivos en sombras u objetos de fondo
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
    const detectionPromise = faceapi.detectAllFaces(tensor as any, options)
      .withFaceLandmarks()
      .withFaceDescriptors();
      
    const timeoutPromise = new Promise<any[]>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT_FACE_DETECTION')), 15000);
    });

    const detections = await Promise.race([detectionPromise, timeoutPromise]);

    return detections.map(d => ({
      descriptor: Array.from(d.descriptor),
      box: {
        x: d.detection.box.x,
        y: d.detection.box.y,
        width: d.detection.box.width,
        height: d.detection.box.height
      }
    }));

  } catch (error: any) {
    console.error('[Face API] Error detectando rostros en', path.basename(imagePath), ':', error.message);
    return [];
  } finally {
    if (tensor) {
      try { tensor.dispose(); } catch (e) {}
    }
  }
}
