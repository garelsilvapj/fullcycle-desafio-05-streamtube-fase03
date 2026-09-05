import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { BEARER_PREFIX } from '../auth.constants';
import { JwtPayload } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user: unknown }>();
    const authHeader = request.headers?.authorization;

    // Rotas públicas: autenticação opcional (TD-04.5). Um Bearer válido identifica o usuário
    // (ex.: dono vendo a thumbnail de um rascunho); ausente ou inválido, segue anônimo.
    if (isPublic) {
      request.user = await this.tryParseUser(authHeader);
      return true;
    }

    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice(BEARER_PREFIX.length);

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private async tryParseUser(
    authHeader: string | undefined,
  ): Promise<JwtPayload | undefined> {
    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) return undefined;
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(
        authHeader.slice(BEARER_PREFIX.length),
      );
    } catch {
      return undefined;
    }
  }
}
