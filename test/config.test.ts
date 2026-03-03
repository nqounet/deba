import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, initConfig, clearConfigCache } from '../src/utils/config';

// モックの設定をトップレベルで定義
vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/home/user')
  },
  homedir: vi.fn(() => '/home/user')
}));
vi.mock('fs/promises');

describe('utils/config module', () => {
  const mockHomedir = '/home/user';
  const configDir = path.join(mockHomedir, '.deba');
  const configPath = path.join(configDir, 'config.toml');

  const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    clearConfigCache();
  });

  describe('loadConfig', () => {
    it('設定ファイルが存在する場合、パースして返すこと', async () => {
      const tomlContent = `
[ai]
provider = "gemini"
model = "gpt-4"
`;
      vi.mocked(fs.readFile).mockResolvedValue(tomlContent);

      const config = await loadConfig();
      expect(config.ai.provider).toBe('gemini');
      expect(config.ai.model).toBe('gpt-4');
    });

    it('設定ファイルが不正または存在しない場合、デフォルト値を返すこと', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const config = await loadConfig();
      expect(config.ai.provider).toBe('gemini');
      expect(config.ai.model).toBeUndefined();
    });

    it('2回目の呼び出しではキャッシュが使われファイルI/Oが発生しないこと', async () => {
      const tomlContent = `
[ai]
provider = "codex"
`;
      vi.mocked(fs.readFile).mockResolvedValue(tomlContent);

      const config1 = await loadConfig();
      const config2 = await loadConfig();

      expect(config1.ai.provider).toBe('codex');
      expect(config2.ai.provider).toBe('codex');
      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });

    it('clearConfigCacheを呼ぶとキャッシュがクリアされること', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('[ai]\nprovider = "copilot"\n');

      await loadConfig();
      clearConfigCache();

      vi.mocked(fs.readFile).mockResolvedValue('[ai]\nprovider = "gemini"\n');
      const config = await loadConfig();

      expect(config.ai.provider).toBe('gemini');
      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('initConfig', () => {
    it('設定ファイルが存在しない場合、新規作成すること', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await initConfig();

      expect(fs.mkdir).toHaveBeenCalledWith(configDir, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(configPath, expect.any(String), 'utf-8');
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('設定ファイルを初期化しました'));
    });

    it('設定ファイルが既に存在する場合、作成をスキップすること', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await initConfig();

      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('設定ファイルは既に存在します'));
    });

    it('エラーが発生した場合、エラーログを出力すること', async () => {
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'));

      await initConfig();

      expect(mockError).toHaveBeenCalledWith(expect.stringContaining('設定ファイルの初期化に失敗しました'), expect.any(Error));
    });
  });
});
