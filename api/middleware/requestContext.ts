import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('X-Request-Id');
  req.requestId = incoming && /^[a-zA-Z0-9._-]{1,128}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  req.input = { body: req.body ?? {}, query: req.query as Record<string, unknown>, params: req.params };
  next();
}
