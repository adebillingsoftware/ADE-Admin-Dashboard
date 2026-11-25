import app from '../server/app.js';

/**
 * Vercel serverless entry point. Express app is exported, not started.
 * Vercel injects the request/response pair into this default export.
 */
export default app;
