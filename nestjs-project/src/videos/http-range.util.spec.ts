import { parseRangeHeader } from './http-range.util';

describe('parseRangeHeader', () => {
  const total = 10_000;

  it('sem header → serve o objeto inteiro', () => {
    expect(parseRangeHeader(undefined, total)).toEqual({ kind: 'none' });
    expect(parseRangeHeader('', total)).toEqual({ kind: 'none' });
  });

  it('tamanho desconhecido → ignora o Range', () => {
    expect(parseRangeHeader('bytes=0-10', 0)).toEqual({ kind: 'none' });
  });

  it('faixa fechada dentro dos limites', () => {
    expect(parseRangeHeader('bytes=0-1023', total)).toEqual({
      kind: 'range',
      start: 0,
      end: 1023,
    });
  });

  it('faixa fechada além do fim é truncada no último byte', () => {
    expect(parseRangeHeader('bytes=9000-99999', total)).toEqual({
      kind: 'range',
      start: 9000,
      end: 9999,
    });
  });

  it('faixa aberta é limitada ao chunk padrão', () => {
    expect(parseRangeHeader('bytes=100-', total, 1000)).toEqual({
      kind: 'range',
      start: 100,
      end: 1099,
    });
  });

  it('faixa aberta perto do fim termina no último byte', () => {
    expect(parseRangeHeader('bytes=9500-', total, 1000)).toEqual({
      kind: 'range',
      start: 9500,
      end: 9999,
    });
  });

  it('sufixo devolve os últimos N bytes', () => {
    expect(parseRangeHeader('bytes=-500', total)).toEqual({
      kind: 'range',
      start: 9500,
      end: 9999,
    });
    expect(parseRangeHeader('bytes=-99999', total)).toEqual({
      kind: 'range',
      start: 0,
      end: 9999,
    });
  });

  it.each([
    'bytes=10000-',
    'bytes=20000-30000',
    'bytes=500-100',
    'bytes=-0',
    'bytes=-',
    'bytes=abc',
    'items=0-10',
    'bytes=0-10,20-30',
  ])('"%s" → unsatisfiable', (header) => {
    expect(parseRangeHeader(header, total)).toEqual({ kind: 'unsatisfiable' });
  });
});
