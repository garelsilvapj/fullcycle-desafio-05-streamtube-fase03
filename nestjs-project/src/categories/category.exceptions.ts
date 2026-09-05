import { DomainException } from '../common/exceptions/domain.exception';

export class CategoryNotFoundException extends DomainException {
  constructor() {
    super('CATEGORY_NOT_FOUND', 404, 'Categoria não encontrada');
  }
}
