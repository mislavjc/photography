import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'upload',
    description: 'Upload photos to R2 with variant generation',
  },
  args: {
    srcDir: {
      type: 'positional',
      description: 'Source directory for images',
      default: './images',
    },
  },
  async run({ args }) {
    const { runUpload } = await import('../effect/upload.js');
    await runUpload(args.srcDir);
  },
});
