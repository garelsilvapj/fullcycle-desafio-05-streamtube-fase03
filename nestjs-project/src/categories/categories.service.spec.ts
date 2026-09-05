import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { CategoryNotFoundException } from './category.exceptions';

describe('CategoriesService', () => {
  let service: CategoriesService;
  const repo = {
    find: jest.fn(() =>
      Promise.resolve([{ id: 'c1', name: 'Games', slug: 'games' }]),
    ),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(Category), useValue: repo },
      ],
    }).compile();
    service = mod.get(CategoriesService);
  });

  it('list ordena por nome', async () => {
    const out = await service.list();
    expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
    expect(out).toHaveLength(1);
  });

  it('getById lança CATEGORY_NOT_FOUND para id desconhecido', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    await expect(service.getById('nope')).rejects.toBeInstanceOf(
      CategoryNotFoundException,
    );
    repo.findOne.mockResolvedValueOnce({ id: 'c1' });
    await expect(service.getById('c1')).resolves.toMatchObject({ id: 'c1' });
  });
});
