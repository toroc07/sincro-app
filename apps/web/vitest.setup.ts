/**
 * Setup global de vitest.
 *
 * Neutraliza GROQ_API_KEY: si está puesta en `.env.local` (para probar el
 * resumen IA a mano), no queremos que la suite facture llamadas reales a Groq
 * ni dependa de la red. Los tests que ejercitan el camino "con motor" mockean
 * `fetch` y hacen su propio `vi.stubEnv`.
 */
process.env.GROQ_API_KEY = '';
process.env.ELEVENLABS_API_KEY = '';
process.env.OPENAI_API_KEY = '';
