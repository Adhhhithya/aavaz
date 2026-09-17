import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

/**
 * Extracts the bearer token from the Authorization header. Throws 401 if the
 * header is missing or not a well-formed 'Bearer <token>' value — the direct
 * equivalent of api/auth/dependencies.py::get_bearer_token. This runs before
 * any database call, so a request with no credentials at all never reaches
 * Prisma.
 */
export function extractBearerToken(request: Request): string {
  const header = request.headers['authorization'];
  if (!header || Array.isArray(header) || !header.startsWith('Bearer ')) {
    throw new UnauthorizedException('Missing or malformed Authorization header');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new UnauthorizedException('Missing bearer token');
  }
  return token;
}
