import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'empty',
    description: 'Empty the R2 bucket (dangerous!)',
  },
  async run() {
    const { runEmpty } = await import('../effect/empty.js');
    await runEmpty();
  },
});
