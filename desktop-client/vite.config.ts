import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  server: {
    port: 5174,
    strictPort: true,
  },
  plugins: [
    react({}),
    // @ts-ignore
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: [
                'better-sqlite3',
                'sharp',
                '@huggingface/transformers',
                '@vladmandic/face-api',
                '@tensorflow/tfjs',
                '@tensorflow/tfjs-backend-wasm',
                'express',
                'multer',
                'exifr'
              ]
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
      },
      {
        // Worker thread for face detection — runs TensorFlow in isolation
        entry: 'electron/server/faceWorker.ts',
        vite: {
          build: {
            rollupOptions: {
              external: [
                'sharp',
                '@vladmandic/face-api',
                '@tensorflow/tfjs',
                '@tensorflow/tfjs-backend-wasm',
                'worker_threads',
              ]
            }
          }
        }
      },
    ]),
  ],
})
