import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';

// js/, styles/ và vendor/ chứa script & stylesheet thường nạp động bởi portal.js nên chép nguyên sang dist khi build.
const copyLegacyAssets = () => ({
  name: 'copy-legacy-assets',
  apply: 'build',
  closeBundle() {
    for (const dir of ['js', 'styles', 'vendor']) {
      cpSync(dir, `dist/${dir}`, { recursive: true });
    }
  },
});

export default defineConfig({
  plugins: [copyLegacyAssets()],
});
