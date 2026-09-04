import { DomainException } from '../common/exceptions/domain.exception';

// Exceções de domínio da fase de vídeos, no padrão da base (DomainException +
// DomainExceptionFilter global). Códigos com prefixo VIDEO_.
export class VideoNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_NOT_FOUND', 404, 'Vídeo não encontrado');
  }
}

export class VideoChannelForbiddenException extends DomainException {
  constructor() {
    super(
      'VIDEO_CHANNEL_FORBIDDEN',
      403,
      'Usuário não é dono do canal deste vídeo',
    );
  }
}

export class VideoNotReadyException extends DomainException {
  constructor() {
    super(
      'VIDEO_NOT_READY',
      409,
      'Vídeo ainda não está pronto para reprodução',
    );
  }
}

export class VideoUploadNotConfirmedException extends DomainException {
  constructor() {
    super(
      'VIDEO_UPLOAD_NOT_CONFIRMED',
      409,
      'Arquivo do vídeo não encontrado no storage',
    );
  }
}

export class VideoInvalidRangeException extends DomainException {
  constructor() {
    super('VIDEO_INVALID_RANGE', 416, 'Range solicitado é inválido');
  }
}

export class ChannelNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_CHANNEL_NOT_FOUND', 404, 'Canal do usuário não encontrado');
  }
}

export class VideoInvalidStateException extends DomainException {
  constructor(current: string, allowed: readonly string[]) {
    super(
      'VIDEO_INVALID_STATE',
      409,
      `Operação não permitida no estado '${current}' (esperado: ${allowed.join(' | ')})`,
    );
  }
}
