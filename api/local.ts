import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import app from './app.js';
import { env } from './config/env.js';
import { log } from './utils/logger.js';

const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

const port = Number(env.PORT || 3001);
app.listen(port, () => {
  log('info', 'Local development API server started', { port, note: 'Production uses the Vercel serverless entry point.' });
});
