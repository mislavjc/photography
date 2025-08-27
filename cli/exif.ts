// exif-load.ts
// -------------------------------------------------------------
// pnpm add exiftool-vendored effect
//   or: npm i exiftool-vendored effect
//
// Run: ts-node exif-load.ts

import { Effect } from 'effect';
import { exiftool, Tags } from 'exiftool-vendored';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';

const SOURCE_PATH = './images/DSCF0004.jpg';

/** Effectful readFileSync wrapper (keeps your original buffer step). */
const readFileBuffer = (p: string) =>
  Effect.sync(() => fs.readFileSync(p) as Buffer);

/** Write a temp file (so exiftool can read from disk), returns its path. */
const writeTempFile = (buf: Buffer) =>
  Effect.tryPromise({
    try: async () => {
      const tmp = path.join(
        os.tmpdir(),
        `exif-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
      );
      await fsp.writeFile(tmp, buf);
      return tmp;
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });

/** Read all metadata with exiftool; returns the full `Tags` object. */
const readAllTags = (filePath: string) =>
  Effect.tryPromise<Tags, Error>({
    try: async () => await exiftool.read(filePath),
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });

/** Ensure the exiftool child process is shut down. */
const shutdownExiftool = Effect.tryPromise({
  try: async () => {
    await exiftool.end();
  },
  catch: (e) => (e instanceof Error ? e : new Error(String(e))),
}).pipe(Effect.ignore); // ignore shutdown errors

/** Main program */
const load = Effect.scoped(
  Effect.gen(function* () {
    // 1) Read your JPEG into a Buffer (preserves your original code shape)
    const buffer = yield* readFileBuffer(SOURCE_PATH);

    // 2) Materialize to a temp file for exiftool
    const tmpPath = yield* writeTempFile(buffer);

    // 3) Read all metadata (fully typed: `Tags`)
    const tags: Tags = yield* readAllTags(tmpPath);

    // 4) Log the entire metadata object
    //    This includes EXIF, IPTC, XMP and Fujifilm MakerNotes when present.
    //    Example keys: Make, Model, DateTimeOriginal, FilmSimulation, DynamicRange, etc.
    //    (Keys are optional and depend on the file.)

    console.log(tags);

    // 5) Cleanup temp file (will be cleaned up by Effect scope)
    yield* Effect.tryPromise({
      try: async () => await fsp.unlink(tmpPath),
      catch: () => undefined,
    }).pipe(Effect.ignore);
  }).pipe(
    // Always shut down the exiftool child process when we’re done
    Effect.ensuring(shutdownExiftool),
  ),
);

// Execute
Effect.runPromise(load).catch((err) => {
  console.error(err);
  process.exit(1);
});
