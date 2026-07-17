import { detectFacesInImage, initFaceModels } from './src/faceUtils';
import fs from 'fs';
import path from 'path';

async function test() {
  await initFaceModels();
  console.log("Models initialized.");
  
  // Find any test image in the storage directory
  const storageDir = path.resolve(__dirname, 'storage');
  if (fs.existsSync(storageDir)) {
    const files = fs.readdirSync(storageDir).filter(f => f.startsWith('thumb-') && f.endsWith('.webp'));
    if (files.length > 0) {
      const testImage = path.join(storageDir, files[0]);
      console.log(`Testing with image: ${testImage}`);
      const faces = await detectFacesInImage(testImage);
      console.log(`Detected ${faces.length} faces.`);
    } else {
      console.log("No thumbnails found to test.");
    }
  } else {
    console.log("Storage directory not found.");
  }
}

test().catch(console.error);
