import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { extractBearerToken } from './bearer-token.util';
import { CurrentVictim, TokenService } from './token.service';

export interface RequestWithVictim extends Request {
  victim?: CurrentVictim;
}

/**
 * NestJS guard equivalent of api/auth/victim_dependencies.py::get_current_victim.
 *
 * Resolves the authenticated principal -> victim_id from the bearer token
 * ONLY — never from a client-supplied victim_id/user_id parameter. Attaches
 * the resolved victim onto the request for the `@Victim()` param decorator
 * to read in the controller.
 */
@Injectable()
export class VictimAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithVictim>();
    const token = extractBearerToken(request);
    request.victim = this.tokenService.getCurrentVictim(token);
    return true;
  }
}
