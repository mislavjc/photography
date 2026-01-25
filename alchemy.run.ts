import alchemy from 'alchemy';
import { R2Bucket, VectorizeIndex, Worker } from 'alchemy/cloudflare';

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
});

// =============================================================================
// Vectorize (Photo Search)
// =============================================================================

// Vector index for semantic photo search using ImageBind embeddings
export const searchIndex = await VectorizeIndex('photo-search', {
  name: 'photography-search',
  description: 'Semantic photo search using ImageBind embeddings',
  dimensions: 1024, // ImageBind output dimensions
  metric: 'cosine',
  adopt: true, // Adopt existing index
});

// =============================================================================
// Search API Worker
// =============================================================================

// Only deploy worker if REPLICATE_API_TOKEN is set
const replicateApiToken = process.env.REPLICATE_API_TOKEN;

export const searchWorker = replicateApiToken
  ? await Worker('search-api', {
      name: 'photography-search-api',
      entrypoint: './apps/search-worker/src/index.ts',
      adopt: true,
      bindings: {
        VECTORIZE: searchIndex,
        PHOTOS_BUCKET: photosBucket,
        REPLICATE_API_TOKEN: alchemy.secret(replicateApiToken),
      },
      url: true, // Enable workers.dev URL
    })
  : null;

if (!replicateApiToken) {
  console.log('\n⚠️  REPLICATE_API_TOKEN not set. Search worker not deployed.');
  console.log('   Get a token at: https://replicate.com/account/api-tokens');
  console.log(
    '   Then run: REPLICATE_API_TOKEN=your_token bun alchemy.run.ts\n',
  );
}

if (searchWorker) {
  console.log(`Search API: ${searchWorker.url}`);
}

// =============================================================================
// Finalize
// =============================================================================

await app.finalize();
