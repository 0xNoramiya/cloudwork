import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { cloudworksApi } from './server/apiPlugin.ts'

export default defineConfig(({ mode }) => {
  // Make provider keys from .env / .env.local visible to the local API proxy (never to the browser bundle).
  const env = loadEnv(mode, process.cwd(), '')
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'CUSTOM_LLM_API_KEY', 'ANTHROPIC_UPSTREAM', 'OPENAI_UPSTREAM', 'OPENROUTER_UPSTREAM']) {
    if (env[k] && !process.env[k]) process.env[k] = env[k]
  }
  return {
    plugins: [react(), cloudworksApi()],
    server: { port: 5173 },
    preview: { port: 4173 },
    build: { chunkSizeWarningLimit: 3000 },
    worker: { format: 'es' },
  }
})
