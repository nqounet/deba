import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { execSync } from 'child_process';
import * as ai from '../src/ai';
import { performIngestion, loadIngestion } from '../src/ingestion';

vi.mock('fs/promises');
vi.mock('child_process');
vi.mock('../src/ai');
vi.mock('../src/utils/git', () => ({
  getMainRepoRoot: vi.fn(() => '/mock/root'),
  getRepoStorageRoot: vi.fn(() => '/mock/repo')
}));

describe('ingestion module', () => {
  const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('performIngestion', () => {
    it('プロジェクトを調査し、LLMの結果を保存すること', async () => {
      vi.mocked(execSync).mockReturnValue(`file1\nfile2\n` as any);
      vi.mocked(fs.readFile).mockResolvedValue(`{"name": "test-project"}` as any);
      vi.mocked(ai.generateContent).mockResolvedValue({ text: '# Project Summary', meta: {} } as any);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await performIngestion();

      expect(result).toBe('# Project Summary');
      expect(execSync).toHaveBeenCalledWith(expect.stringContaining('git ls-files'), expect.any(Object));
      expect(ai.generateContent).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('ingestion.md'), '# Project Summary', 'utf-8');
    });

    it('Git管理下でない場合にフォールバックすること', async () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('not a git repo'); });
      vi.mocked(fs.readdir).mockResolvedValue(['fileA', 'fileB'] as any);
      vi.mocked(ai.generateContent).mockResolvedValue({ text: 'fallback summary', meta: {} } as any);

      await performIngestion();

      expect(fs.readdir).toHaveBeenCalled();
      expect(ai.generateContent).toHaveBeenCalledWith(expect.stringContaining('fileA'));
    });

    it('LLM呼び出しに失敗した場合、エラーメッセージを返すこと', async () => {
      vi.mocked(ai.generateContent).mockRejectedValue(new Error('AI failed'));
      
      const result = await performIngestion();
      
      expect(result).toContain('解析に失敗しました');
      expect(mockError).toHaveBeenCalled();
    });
  });

  describe('loadIngestion', () => {
    it('既存のファイルがある場合、それを読み込むこと', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('existing ingestion');
      
      const result = await loadIngestion();
      
      expect(result).toBe('existing ingestion');
      expect(ai.generateContent).not.toHaveBeenCalled();
    });

    it('既存のファイルがない場合、performIngestion を実行すること', async () => {
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('ENOENT'));
      vi.mocked(ai.generateContent).mockResolvedValue({ text: 'newly generated', meta: {} } as any);

      const result = await loadIngestion();

      expect(result).toBe('newly generated');
      expect(ai.generateContent).toHaveBeenCalled();
    });
  });
});
