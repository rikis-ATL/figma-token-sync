import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';

// Build mode: UI or plugin
const isUIBuild = process.env.BUILD_MODE !== 'plugin';

export default defineConfig({
  plugins: isUIBuild ? [react(), viteSingleFile()] : [],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2017',
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: isUIBuild
      ? {
          input: path.resolve(__dirname, 'src/ui/index.html'),
        }
      : {
          input: path.resolve(__dirname, 'src/plugin/index.ts'),
          output: {
            entryFileNames: 'plugin.js',
            format: 'iife',
          },
        },
  },
});
