import { generateVideoSlug, VIDEO_SLUG_PATTERN } from './slug.util';
import { VIDEO_SLUG_LENGTH } from './videos.constants';

describe('generateVideoSlug', () => {
  it('gera slugs com 11 caracteres URL-safe', () => {
    for (let i = 0; i < 200; i++) {
      const slug = generateVideoSlug();
      expect(slug).toHaveLength(VIDEO_SLUG_LENGTH);
      expect(slug).toMatch(VIDEO_SLUG_PATTERN);
    }
  });

  it('respeita o tamanho informado', () => {
    expect(generateVideoSlug(5)).toHaveLength(5);
  });

  it('não repete em uma amostra (entropia suficiente)', () => {
    const sample = new Set(
      Array.from({ length: 1000 }, () => generateVideoSlug()),
    );
    expect(sample.size).toBe(1000);
  });
});
