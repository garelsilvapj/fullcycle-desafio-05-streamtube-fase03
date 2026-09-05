import { DomainException } from '../common/exceptions/domain.exception';

export class CommentNotFoundException extends DomainException {
  constructor() {
    super('COMMENT_NOT_FOUND', 404, 'Comentário não encontrado');
  }
}

export class CommentForbiddenException extends DomainException {
  constructor() {
    super('COMMENT_FORBIDDEN', 403, 'Só o autor pode excluir o comentário');
  }
}

export class CommentReplyDepthException extends DomainException {
  constructor() {
    super(
      'COMMENT_REPLY_DEPTH',
      400,
      'Só é possível responder a comentários de primeiro nível',
    );
  }
}
