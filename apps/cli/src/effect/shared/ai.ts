import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { Effect, Schedule } from 'effect';
import { Tags } from 'exiftool-vendored';
import fsp from 'node:fs/promises';
import sharp from 'sharp';

import type { ExifMetadata, ManifestEntry } from './types';

// ----------------------- AI Helpers -----------------------
export const readBuffer = (p: string) =>
  Effect.tryPromise<Buffer, Error>({
    try: async () => await fsp.readFile(p),
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });

export const makePreviewJpeg = (buf: Buffer) =>
  Effect.tryPromise<Buffer, Error>({
    try: async () =>
      await sharp(buf)
        .rotate()
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer(),
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });

export const buildPromptFromManifest = (
  entry:
    | {
        blurhash: string;
        w: number;
        h: number;
        exif: ExifMetadata;
        description?: string;
      }
    | undefined,
  tags: Tags,
) => {
  const exif: ExifMetadata = entry?.exif || {
    camera: null,
    lens: null,
    focalLength: null,
    aperture: null,
    shutterSpeed: null,
    iso: null,
    location: null,
    dateTime: null,
  };

  return `
You are a professional photographer and photo critic. Write a rich, detailed description of this photograph as if you're describing it for a gallery exhibition or photography portfolio.

Focus on:
- What you see in the image (subjects, setting, composition)
- The mood and atmosphere
- Lighting and technical qualities
- Your artistic interpretation

Write 2-4 sentences that paint a vivid picture. Start with "A photo of..." and make it evocative and descriptive.

${
  exif.location?.address
    ? `Location: ${exif.location.address}`
    : exif.location?.latitude && exif.location?.longitude
      ? `Location: Approximate coordinates available.`
      : 'Location: Unknown.'
}
Technical: ${JSON.stringify(
    {
      Camera:
        exif.camera ??
        (tags as unknown as { Model: string; Make: string }).Model ??
        (tags as unknown as { LensModel: string; Lens: string }).LensModel,
      Lens:
        exif.lens ??
        (tags as unknown as { LensModel: string; Lens: string }).LensModel ??
        (tags as unknown as { Lens: string }).Lens,
      FNumber:
        exif.aperture ?? (tags as unknown as { FNumber: string }).FNumber,
      ISO: exif.iso ?? (tags as unknown as { ISO: string }).ISO,
      Shutter:
        exif.shutterSpeed ??
        (tags as unknown as { ShutterSpeed: string }).ShutterSpeed ??
        tags.ExposureTime,
      DateTime:
        exif.dateTime ??
        (tags as unknown as { DateTimeOriginal: string }).DateTimeOriginal ??
        tags.CreateDate ??
        tags.ModifyDate,
    },
    null,
    2,
  )}`;
};

export const analyzeWithAI = (imageBuf: Buffer, prompt: string) =>
  Effect.retry(
    Effect.tryPromise<{ text: string }, Error>({
      try: async () =>
        await generateText({
          model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', image: imageBuf, mediaType: 'image/jpeg' },
                { type: 'text', text: prompt },
              ],
            },
          ],
        }),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }),
    Schedule.recurs(2), // 3 total attempts
  );

// Generate AI description for a single entry
const generateDescription = (
  filePath: string,
  entry: ManifestEntry,
  tags: Tags,
) =>
  Effect.gen(function* () {
    const buf = yield* readBuffer(filePath);
    const preview = yield* makePreviewJpeg(buf);
    const prompt = buildPromptFromManifest(entry, tags);
    const { text } = yield* analyzeWithAI(preview, prompt);
    return text.trim();
  });
