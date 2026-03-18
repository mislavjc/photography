import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local' });

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function emptyBucket(bucket: string) {
  let ContinuationToken: string | undefined;

  do {
    const listed = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken }),
    );
    if (!listed.Contents || listed.Contents.length === 0) break;

    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: listed.Contents.map((obj) => ({ Key: obj.Key! })) },
      }),
    );

    ContinuationToken = listed.NextContinuationToken;
  } while (ContinuationToken);
}

export function runEmpty() {
  return emptyBucket('photography');
}
