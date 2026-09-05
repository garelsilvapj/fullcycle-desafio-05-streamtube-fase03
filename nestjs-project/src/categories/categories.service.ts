import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CategoryNotFoundException } from './category.exceptions';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly repo: Repository<Category>,
  ) {}

  async list(): Promise<Category[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async getById(id: string): Promise<Category> {
    const category = await this.repo.findOne({ where: { id } });
    if (!category) throw new CategoryNotFoundException();
    return category;
  }
}
