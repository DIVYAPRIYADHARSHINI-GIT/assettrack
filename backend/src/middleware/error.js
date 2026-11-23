import { Prisma } from '@prisma/client';
import multer from 'multer';
import { HttpError } from '../lib/errors.js';
import { config } from '../config.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
}

// Centralized error handler: every error becomes { error: { message, details? } }
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let message = 'Internal server error';
  let details;

  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
    details = err.details;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = [].concat(err.meta?.target || []).join(', ');
      status = 409;
      message = target ? `A record with this ${humanField(target)} already exists` : 'Duplicate value';
      details = { fields: Object.fromEntries([].concat(err.meta?.target || []).map((f) => [f, 'Already exists'])) };
    } else if (err.code === 'P2025') {
      status = 404;
      message = 'Resource not found';
    } else if (err.code === 'P2003') {
      status = 409;
      message = 'This record is referenced by other records';
    } else {
      status = 400;
      message = 'Database request failed';
    }
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 2 MB)' : err.message;
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  } else if (err?.message?.startsWith('CORS')) {
    status = 403;
    message = err.message;
  }

  if (status >= 500 && !config.isTest) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(status).json({ error: { message, ...(details ? { details } : {}) } });
}

function humanField(target) {
  return target
    .replace('serialNumber', 'serial number')
    .replace('assetTag', 'asset tag')
    .replace('email', 'email');
}
