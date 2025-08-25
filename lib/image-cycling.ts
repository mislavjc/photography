import type { Manifest } from '../types';

// Image cycling system to avoid repetition until all images are exhausted
class ImageCycler {
  private portraitImages: string[] = [];
  private landscapeImages: string[] = [];
  private portraitIndex = 0;
  private landscapeIndex = 0;
  private initialized = false;
  private currentManifestSize = 0;

  private initializeFromManifest(manifest: Manifest) {
    const manifestSize = Object.keys(manifest).length;
    if (this.initialized && manifestSize === this.currentManifestSize) return;

    // Reset if manifest has changed
    if (this.initialized && manifestSize !== this.currentManifestSize) {
      this.reset();
    }

    const allImages = Object.keys(manifest);
    this.portraitImages = [];
    this.landscapeImages = [];

    // Separate images by orientation
    allImages.forEach((imageId) => {
      const image = manifest[imageId];
      if (!image) return;

      if (image.h > image.w) {
        this.portraitImages.push(imageId);
      } else {
        this.landscapeImages.push(imageId);
      }
    });

    // Shuffle arrays once for variety while maintaining deterministic cycling
    this.portraitImages = this.shuffleArray([...this.portraitImages], 12345);
    this.landscapeImages = this.shuffleArray([...this.landscapeImages], 67890);

    this.initialized = true;
    this.currentManifestSize = manifestSize;
  }

  private shuffleArray<T>(array: T[], seed: number): T[] {
    const shuffled = [...array];
    // Simple deterministic shuffle using seed
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = seed % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Get next image in cycle for the given orientation and spatial position
  public getImageByOrientation(
    manifest: Manifest,
    tileX: number,
    tileY: number,
    col: number,
    imageIndex: number,
    isPortrait: boolean,
  ): string | null {
    this.initializeFromManifest(manifest);

    const images = isPortrait ? this.portraitImages : this.landscapeImages;
    if (images.length === 0) {
      // Fallback to any image if no images match orientation
      const allImages = Object.keys(manifest);
      return allImages.length > 0 ? allImages[0] : null;
    }

    // Create a unique spatial index based on position to ensure smooth cycling
    // This ensures adjacent images in the grid are different
    const spatialIndex =
      Math.abs(tileX) * 7919 + // Large prime for tile X
      Math.abs(tileY) * 6151 + // Large prime for tile Y
      col * 2971 + // Medium prime for column
      imageIndex * 1009; // Smaller prime for image position

    // Get cycling position - this ensures we go through all images
    const cyclePosition = spatialIndex % images.length;

    return images[cyclePosition];
  }

  // Reset cycling state (useful for testing or when manifest changes)
  public reset() {
    this.portraitImages = [];
    this.landscapeImages = [];
    this.portraitIndex = 0;
    this.landscapeIndex = 0;
    this.initialized = false;
  }

  // Get cycling stats for debugging
  public getStats() {
    return {
      portraitImages: this.portraitImages.length,
      landscapeImages: this.landscapeImages.length,
      initialized: this.initialized,
    };
  }
}

// Singleton instance for the app
const imageCycler = new ImageCycler();

export default imageCycler;

// Convenience function that mimics the old API but uses cycling
export function getCycledImageByOrientation(
  manifest: Manifest,
  tileX: number,
  tileY: number,
  col: number,
  imageIndex: number,
  isPortrait: boolean,
): string | null {
  return imageCycler.getImageByOrientation(
    manifest,
    tileX,
    tileY,
    col,
    imageIndex,
    isPortrait,
  );
}
