import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'regenerate',
    description: 'Regenerate variants from R2 originals',
  },
  async run() {
    const { runRegenerate } = await import('../effect/regenerate.js');
    await runRegenerate();
  },
});
