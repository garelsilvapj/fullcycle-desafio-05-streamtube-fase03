import { DomainException } from '../common/exceptions/domain.exception';

export class ChannelNotFoundException extends DomainException {
  constructor() {
    super('CHANNEL_NOT_FOUND', 404, 'Canal não encontrado');
  }
}

export class NicknameTakenException extends DomainException {
  constructor() {
    super('CHANNEL_NICKNAME_TAKEN', 409, 'Este nickname já está em uso');
  }
}
