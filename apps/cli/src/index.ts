#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';

const main = defineCommand({
  meta: {
    name: 'photo-cli',
    version: '0.0.1',
    description: 'Photography portfolio CLI tools',
  },
  subCommands: {
    descriptions: () =>
      import('./commands/descriptions.js').then((m) => m.default),
    manifest: () => import('./commands/manifest.js').then((m) => m.default),
    embeddings: () => import('./commands/embeddings.js').then((m) => m.default),
  },
});

runMain(main);
