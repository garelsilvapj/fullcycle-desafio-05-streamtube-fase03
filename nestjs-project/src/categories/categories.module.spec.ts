import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createTestDataSource } from '../test/create-test-data-source';
import { Category } from './entities/category.entity';
import { CategoriesModule } from './categories.module';
import { CategoriesService } from './categories.service';

describe('CategoriesModule', () => {
  it('compila com TypeOrmModule.forFeature([Category])', async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(
          createTestDataSource([Category], { synchronize: false }).options,
        ),
        CategoriesModule,
      ],
    }).compile();
    expect(module.get(CategoriesService)).toBeInstanceOf(CategoriesService);
    await module.close();
  }, 30000);
});
