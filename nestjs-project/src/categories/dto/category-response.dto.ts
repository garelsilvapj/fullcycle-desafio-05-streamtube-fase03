import { ApiProperty } from '@nestjs/swagger';
import { Category } from '../entities/category.entity';

export class CategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Tecnologia' })
  name: string;

  @ApiProperty({ example: 'tecnologia' })
  slug: string;
}

export function toCategoryResponse(category: Category): CategoryResponseDto {
  return { id: category.id, name: category.name, slug: category.slug };
}
