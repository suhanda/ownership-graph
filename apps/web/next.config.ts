import type { NextConfig } from 'next';

const config: NextConfig = {
  // the shared package ships TypeScript-built CommonJS from the workspace
  transpilePackages: ['@ownership/shared'],
};

export default config;
