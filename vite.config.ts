import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the built app works from any path, including project
  // pages such as https://<user>.github.io/aws-saa-cert-quiz/.
  base: './',
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
