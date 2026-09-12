import { escapeLike } from './discovery.service';

describe('escapeLike', () => {
  it('escapa curingas do LIKE para o termo ser literal', () => {
    expect(escapeLike('100%_ok\\')).toBe('100\\%\\_ok\\\\');
    expect(escapeLike('ffmpeg')).toBe('ffmpeg');
  });
});
