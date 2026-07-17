const { pipeline } = require('@huggingface/transformers');
const Database = require('better-sqlite3');
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

(async () => {
  const textModel = await pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32');
  const prompts = ["bear", "a photo of a bear", "oso", "a bear"];
  
  const db = new Database('nube.db');
  const files = db.prepare("SELECT originalName, embedding FROM files WHERE originalName IN ('IMG_5598.jpg', 'IMG_5915.jpg', 'IMG_5408.jpg')").all();
  
  for (const p of prompts) {
    const out = await textModel(p);
    const emb = Array.from(out.data);
    console.log(`\nScores for "${p}":`);
    for (const f of files) {
      const score = cosineSimilarity(emb, JSON.parse(f.embedding));
      console.log(`  ${f.originalName}: ${score.toFixed(4)}`);
    }
  }
})();
