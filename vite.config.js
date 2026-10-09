import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 gera um único index.html (útil para publicar como página estática simples).
export default defineConfig({
  plugins: [react(), ...(process.env.SINGLE ? [viteSingleFile()] : [])],
});
