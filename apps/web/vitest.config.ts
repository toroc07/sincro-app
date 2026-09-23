import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Carga el .env de la app (apps/web) y el .env.local de la raiz del monorepo
// (DATABASE_URL y otros). Los valores ya presentes en el entorno no se pisan.
dotenv.config({ path: fileURLToPath(new URL('../../.env.local', import.meta.url)) });
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
dotenv.config({ path: fileURLToPath(new URL('.env.local', import.meta.url)) });

export default defineConfig({
  // Los .tsx del repo se compilan con el JSX automático de React 19; sin esto
  // esbuild emite React.createElement y los componentes fallan en los tests.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
