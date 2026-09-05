import { DomainException } from '../common/exceptions/domain.exception';

export class SubscriptionSelfException extends DomainException {
  constructor() {
    super(
      'SUBSCRIPTION_SELF',
      409,
      'Não é possível inscrever-se no próprio canal',
    );
  }
}
