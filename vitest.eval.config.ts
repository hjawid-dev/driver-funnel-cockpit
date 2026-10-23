/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';

/** `npm run eval`: the assistant's eval suite against the real model (needs ANTHROPIC_API_KEY in .env.local). */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  return {
    test: {
      environment: 'node',
      include: ['evals/**/*.eval.ts'],
      testTimeout: 60_000,
      hookTimeout: 60_000,
      maxConcurrency: 4,
    },
  };
});
