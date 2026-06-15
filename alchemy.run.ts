import alchemy from 'alchemy';
import { KVNamespace, R2Bucket, Worker } from 'alchemy/cloudflare';

const app = await alchemy('photography', {
  phase: process.argv.includes('--destroy') ? 'destroy' : 'up',
  // Password for encrypting secrets in state files
  password: process.env.ALCHEMY_PASSWORD,
});

// =============================================================================
// R2 Storage
// =============================================================================

// Adopt existing R2 bucket (40.7GB, 83K photos)
// This won't recreate it, just manages it through Alchemy
export const photosBucket = await R2Bucket('photos', {
  name: 'photography',
  adopt: true,
  locationHint: 'eeur',
  dev: { remote: true }, // Worker dev mode reads the real bucket, not miniflare-local.
});

// =============================================================================
// KV Namespace (Embedding Cache)
// =============================================================================

// Cache for text embeddings to avoid repeated API calls
export const embeddingCache = await KVNamespace('embedding-cache', {
  title: 'photos-embedding-cache',
  adopt: true,
});

// =============================================================================
// Search API Worker
// =============================================================================

const geminiApiKey = process.env.GEMINI_API_KEY;

export const searchWorker = geminiApiKey
  ? await Worker('search-api', {
      name: 'photos-search-api',
      entrypoint: './apps/search-worker/src/index.ts',
      adopt: true,
      bindings: {
        PHOTOS_BUCKET: photosBucket,
        GEMINI_API_KEY: alchemy.secret(geminiApiKey),
        EMBEDDING_CACHE: embeddingCache,
      },
      url: true,
    })
  : null;

if (!geminiApiKey) {
  console.log('\n⚠️  GEMINI_API_KEY not set. Search worker not deployed.');
  console.log('   Get a key at: https://aistudio.google.com/apikey\n');
}

if (searchWorker) {
  console.log(`Search API: ${searchWorker.url}`);
}

// =============================================================================
// Finalize
// =============================================================================

await app.finalize();
