import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeTestCommand, validateFilePaths } from '../src/utils/sanitize';

describe('sanitize module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('sanitizeTestCommand', () => {
    it('npm test コマンドを許可すること', () => {
      expect(sanitizeTestCommand('npm test')).toBe('npm test');
    });

    it('npm test に引数付きのコマンドを許可すること', () => {
      expect(sanitizeTestCommand('npm test test/specific.test.ts')).toBe('npm test test/specific.test.ts');
    });

    it('npx vitest コマンドを許可すること', () => {
      expect(sanitizeTestCommand('npx vitest run')).toBe('npx vitest run');
    });

    it('npx jest コマンドを許可すること', () => {
      expect(sanitizeTestCommand('npx jest --coverage')).toBe('npx jest --coverage');
    });

    it('前後の空白をトリムすること', () => {
      expect(sanitizeTestCommand('  npm test  ')).toBe('npm test');
    });

    it('空のコマンドを拒否すること', () => {
      expect(() => sanitizeTestCommand('')).toThrow('test_command が空です');
    });

    it('許可されていないコマンドを拒否すること', () => {
      expect(() => sanitizeTestCommand('rm -rf /')).toThrow('許可されたパターンに一致しません');
    });

    it('curl コマンドを拒否すること', () => {
      expect(() => sanitizeTestCommand('curl http://evil.com')).toThrow('許可されたパターンに一致しません');
    });

    it('セミコロンによるコマンド連結を拒否すること', () => {
      expect(() => sanitizeTestCommand('npm test; rm -rf /')).toThrow('危険な文字が含まれています');
    });

    it('&& によるコマンド連結を拒否すること', () => {
      expect(() => sanitizeTestCommand('npm test && curl evil.com')).toThrow('危険な文字が含まれています');
    });

    it('|| によるコマンド連結を拒否すること', () => {
      expect(() => sanitizeTestCommand('npm test || rm -rf /')).toThrow('危険な文字が含まれています');
    });

    it('パイプによるコマンド連結を拒否すること', () => {
      expect(() => sanitizeTestCommand('npm test | tee log.txt')).toThrow('危険な文字が含まれています');
    });

    it('バッククォートによるコマンド実行を拒否すること', () => {
      expect(() => sanitizeTestCommand('npm test `whoami`')).toThrow('危険な文字が含まれています');
    });

    it('$() によるコマンド置換を拒否すること', () => {
      expect(() => sanitizeTestCommand('npm test $(whoami)')).toThrow('危険な文字が含まれています');
    });

    it('リダイレクトを拒否すること', () => {
      expect(() => sanitizeTestCommand('npm test > /dev/null')).toThrow('危険な文字が含まれています');
    });
  });

  describe('validateFilePaths', () => {
    const projectRoot = '/home/user/project';

    it('プロジェクトルート内のパスを許可すること', () => {
      const paths = ['src/index.ts', 'test/index.test.ts'];
      const result = validateFilePaths(paths, projectRoot);
      expect(result).toEqual(['src/index.ts', 'test/index.test.ts']);
    });

    it('パストラバーサルを含むパスを除外すること', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const paths = ['src/index.ts', '../../../../etc/passwd'];
      const result = validateFilePaths(paths, projectRoot);
      expect(result).toEqual(['src/index.ts']);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('パストラバーサルの可能性があるためスキップしました')
      );
    });

    it('絶対パスでプロジェクト外を指すパスを除外すること', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const paths = ['/etc/passwd'];
      const result = validateFilePaths(paths, projectRoot);
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('空の配列を正しく処理すること', () => {
      const result = validateFilePaths([], projectRoot);
      expect(result).toEqual([]);
    });

    it('正規化後にプロジェクトルート内に収まるパスは許可すること', () => {
      const paths = ['src/../src/index.ts'];
      const result = validateFilePaths(paths, projectRoot);
      expect(result).toEqual(['src/../src/index.ts']);
    });
  });
});
