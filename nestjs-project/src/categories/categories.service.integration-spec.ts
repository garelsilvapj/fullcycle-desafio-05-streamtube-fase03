import { DataSource } from 'typeorm';
import { createTestDataSource } from '../test/create-test-data-source';
import { Category } from './entities/category.entity';
import { CategoriesService } from './categories.service';
import { PLATFORM_CATEGORIES } from './categories.constants';

describe('CategoriesService (integration)', () => {
  let dataSource: DataSource;
  let service: CategoriesService;

  beforeAll(async () => {
    dataSource = createTestDataSource([Category], { synchronize: false });
    await dataSource.initialize();
    service = new CategoriesService(dataSource.getRepository(Category));
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('lists the platform categories seeded by the migration, alphabetically', async () => {
    const list = await service.list();
    expect(list.map((c) => c.slug).sort()).toEqual(
      PLATFORM_CATEGORIES.map((c) => c.slug).sort(),
    );
    const names = list.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('getById returns a seeded category', async () => {
    const [first] = await service.list();
    expect((await service.getById(first.id)).slug).toBe(first.slug);
  });
});
