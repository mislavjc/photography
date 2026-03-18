import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import sharp from 'sharp';

import type { ManifestEntry } from './types.js';

function buildPrompt(entry: ManifestEntry): string {
  const exif = entry.exif;

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
      ? 'Location: Approximate coordinates available.'
      : 'Location: Unknown.'
}
Technical: ${JSON.stringify(
    {
      Camera: exif.camera,
      Lens: exif.lens,
      FNumber: exif.aperture,
      ISO: exif.iso,
      Shutter: exif.shutterSpeed,
      DateTime: exif.dateTime,
    },
    null,
    2,
  )}`;
}

export async function generateDescription(
  imageBuf: Buffer,
  entry: ManifestEntry,
): Promise<string> {
  // Resize to reasonable size for AI (max 1920x1080)
  const resized = await sharp(imageBuf)
    .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const prompt = buildPrompt(entry);

  const result = await generateText({
    model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', image: resized, mediaType: 'image/jpeg' },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  return result.text.trim();
}
