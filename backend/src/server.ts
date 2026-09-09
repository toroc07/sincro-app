/**
 * Entrada para correr el audio-service como servidor persistente (local,
 * Render, Docker). En Vercel no se usa: ahí el mismo `app` (sin `.listen`) se
 * sirve como función serverless vía `api/index.ts`.
 */
import app from './app.js';

const PORT = Number(process.env.PORT ?? 4001);

app.listen(PORT, () => {
  console.log(`[audio-service] escuchando en http://localhost:${PORT}`);
});
