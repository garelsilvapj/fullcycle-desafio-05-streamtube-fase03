import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import {
  CategoryResponseDto,
  toCategoryResponse,
} from './dto/category-response.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Listar categorias',
    description: 'Categorias fixas da plataforma, em ordem alfabética.',
  })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async list(): Promise<CategoryResponseDto[]> {
    return (await this.categories.list()).map(toCategoryResponse);
  }
}
