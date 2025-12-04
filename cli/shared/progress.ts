import fsp from 'node:fs/promises';
import path from 'node:path';

import type { CheckpointData, Manifest, ProgressStats } from './types';

const CHECKPOINT_FILE = './upload-progress.json';
const CHECKPOINT_VERSION = 1;

// ----------------------- Progress Tracker -----------------------
export const createProgressTracker = (total: number) => {
  let completed = 0;
  const startTime = Date.now();

  const update = (currentFile?: string, operation?: string) => {
    completed++;
    const pct = Math.round((completed / total) * 100);
    const bar =
      '█'.repeat(Math.floor(pct / 2)) + '░'.repeat(50 - Math.floor(pct / 2));

    // Calculate ETA
    const elapsed = Date.now() - startTime;
    const avgTimePerFile = elapsed / completed;
    const remaining = total - completed;
    const etaMs = avgTimePerFile * remaining;
    const etaStr = formatDuration(etaMs);

    process.stdout.write('\r');
    process.stdout.write(
      `Progress: [${bar}] ${completed}/${total} (${pct}%) ETA: ${etaStr}`,
    );

    if (currentFile && operation) {
      process.stdout.write(` | ${operation}: ${path.basename(currentFile)}`);
    }

    if (completed === total) {
      process.stdout.write('\n');
    }
  };

  return {
    update,
    getCompleted: () => completed,
    getStats: (): ProgressStats => ({
      totalFiles: total,
      processedFiles: completed,
      failedFiles: 0,
      variantsCreated: 0,
      bytesUploaded: 0,
      startTime,
    }),
  };
};

// ----------------------- Enhanced Progress Tracker -----------------------
export const createEnhancedProgressTracker = (total: number) => {
  const stats: ProgressStats = {
    totalFiles: total,
    processedFiles: 0,
    failedFiles: 0,
    variantsCreated: 0,
    bytesUploaded: 0,
    startTime: Date.now(),
  };

  const update = (
    delta: Partial<
      Pick<
        ProgressStats,
        'processedFiles' | 'failedFiles' | 'variantsCreated' | 'bytesUploaded'
      >
    > & {
      currentFile?: string;
      currentOperation?: string;
    },
  ) => {
    if (delta.processedFiles) stats.processedFiles += delta.processedFiles;
    if (delta.failedFiles) stats.failedFiles += delta.failedFiles;
    if (delta.variantsCreated) stats.variantsCreated += delta.variantsCreated;
    if (delta.bytesUploaded) stats.bytesUploaded += delta.bytesUploaded;
    if (delta.currentFile) stats.currentFile = delta.currentFile;
    if (delta.currentOperation) stats.currentOperation = delta.currentOperation;

    const completed = stats.processedFiles + stats.failedFiles;
    const pct = Math.round((completed / total) * 100);
    const bar =
      '█'.repeat(Math.floor(pct / 2)) + '░'.repeat(50 - Math.floor(pct / 2));

    // Calculate ETA
    const elapsed = Date.now() - stats.startTime;
    const avgTimePerFile = completed > 0 ? elapsed / completed : 0;
    const remaining = total - completed;
    const etaMs = avgTimePerFile * remaining;
    const etaStr = formatDuration(etaMs);

    process.stdout.write('\r\x1b[K'); // Clear line
    process.stdout.write(
      `[${bar}] ${completed}/${total} (${pct}%) ETA: ${etaStr}`,
    );

    if (stats.currentFile && stats.currentOperation) {
      const shortName =
        path.basename(stats.currentFile).length > 20
          ? path.basename(stats.currentFile).slice(0, 17) + '...'
          : path.basename(stats.currentFile);
      process.stdout.write(` | ${stats.currentOperation}: ${shortName}`);
    }

    if (completed === total) {
      process.stdout.write('\n');
    }
  };

  const printSummary = () => {
    const elapsed = Date.now() - stats.startTime;
    console.log('\n📊 Summary:');
    console.log(`   Files processed: ${stats.processedFiles}`);
    console.log(`   Files failed: ${stats.failedFiles}`);
    console.log(`   Variants created: ${stats.variantsCreated}`);
    console.log(`   Data uploaded: ${formatBytes(stats.bytesUploaded)}`);
    console.log(`   Time elapsed: ${formatDuration(elapsed)}`);
    console.log(
      `   Avg per file: ${formatDuration(elapsed / (stats.processedFiles || 1))}`,
    );
  };

  return { update, getStats: () => stats, printSummary };
};

// ----------------------- Checkpoint System -----------------------
export const loadCheckpoint = async (): Promise<CheckpointData | null> => {
  try {
    const content = await fsp.readFile(CHECKPOINT_FILE, 'utf-8');
    const data = JSON.parse(content) as CheckpointData;
    if (data.version !== CHECKPOINT_VERSION) {
      console.log('⚠️  Checkpoint version mismatch, starting fresh');
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

export const saveCheckpoint = async (
  data: Omit<CheckpointData, 'version' | 'lastUpdatedAt'>,
): Promise<void> => {
  const checkpoint: CheckpointData = {
    ...data,
    version: CHECKPOINT_VERSION,
    lastUpdatedAt: new Date().toISOString(),
  };
  await fsp.writeFile(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
};

export const clearCheckpoint = async (): Promise<void> => {
  try {
    await fsp.unlink(CHECKPOINT_FILE);
  } catch {
    // Ignore if file doesn't exist
  }
};

export const createCheckpointManager = () => {
  let currentData: CheckpointData = {
    version: CHECKPOINT_VERSION,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    processedFiles: [],
    failedFiles: [],
    manifestEntries: {},
    stats: {
      totalFiles: 0,
      processedCount: 0,
      failedCount: 0,
      variantsCreated: 0,
      bytesUploaded: 0,
    },
  };

  // Use a Set for O(1) lookups on large file lists
  let processedSet = new Set<string>();

  return {
    load: async (): Promise<CheckpointData | null> => {
      const loaded = await loadCheckpoint();
      if (loaded) {
        currentData = loaded;
        processedSet = new Set(loaded.processedFiles);
      }
      return loaded;
    },

    markProcessed: (
      file: string,
      manifestEntry?: { key: string; entry: Manifest[string] },
    ) => {
      currentData.processedFiles.push(file);
      processedSet.add(file);
      currentData.stats.processedCount++;
      if (manifestEntry) {
        currentData.manifestEntries[manifestEntry.key] = manifestEntry.entry;
      }
    },

    markFailed: (file: string, error: string) => {
      currentData.failedFiles.push({ file, error });
      currentData.stats.failedCount++;
    },

    addVariants: (count: number, bytes: number) => {
      currentData.stats.variantsCreated += count;
      currentData.stats.bytesUploaded += bytes;
    },

    setTotalFiles: (total: number) => {
      currentData.stats.totalFiles = total;
    },

    isProcessed: (file: string): boolean => {
      return processedSet.has(file);
    },

    save: () => saveCheckpoint(currentData),

    clear: clearCheckpoint,

    getData: () => currentData,

    getManifestEntries: () => currentData.manifestEntries,
  };
};

// ----------------------- Formatting Utilities -----------------------
export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(ms / 3600000);
  const mins = Math.round((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// ----------------------- General Utilities -----------------------
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
