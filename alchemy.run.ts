import alchemy from 'alchemy';
import {
  KVNamespace,
  R2Bucket,
  VectorizeIndex,
  Worker,
} from 'alchemy/cloudflare';

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
// Vectorize (Photo Search)
// =============================================================================

// Vector index for semantic photo search using ImageBind embeddings (legacy)
export const searchIndex = await VectorizeIndex('photo-search', {
  name: 'photography-search',
  description: 'Semantic photo search using ImageBind embeddings',
  dimensions: 1024, // ImageBind output dimensions
  metric: 'cosine',
  adopt: true, // Adopt existing index
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

// Rollback fallback: old ImageBind+Vectorize worker stays published alongside
// prod so we can flip apps/web SEARCH_API_URL to it if Gemini has an outage.
// Soak window: 7 days after the migration. Remove this block + the legacy
// source dir + the `photography-search` index once we're confident.
const replicateApiToken = process.env.REPLICATE_API_TOKEN;
export const legacySearchWorker = replicateApiToken
  ? await Worker('search-api-legacy', {
      name: 'photos-search-legacy',
      entrypoint: './apps/search-worker-legacy/src/index.ts',
      adopt: true,
      bindings: {
        VECTORIZE: searchIndex,
        PHOTOS_BUCKET: photosBucket,
        REPLICATE_API_TOKEN: alchemy.secret(replicateApiToken),
        EMBEDDING_CACHE: embeddingCache,
      },
      url: true,
    })
  : null;
if (legacySearchWorker) {
  console.log(`Legacy Search API: ${legacySearchWorker.url}`);
}

// =============================================================================
// Finalize
// =============================================================================

await app.finalize();
