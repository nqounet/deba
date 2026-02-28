import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performIngestion, loadIngestion } from '../src/ingestion';
import * as ai from '../src/ai';
import * as fs from 'fs/promises';
import * as prompt from '../src/prompt';
import { execSync } from 'child_process';
import * as gitUtils from '../src/utils/git';

vi.mock('../src/ai');
vi.mock('fs/promises');
vi.mock('child_process');
vi.mock('../src/utils/git');
vi.mock('../src/prompt', () => ({
  buildIngestionPrompt: vi.fn().mockResolvedValue('ingestion prompt content')
}));

describe('ingestion module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gitUtils.getMainRepoRoot).mockReturnValue('/mock/root');
    vi.mocked(gitUtils.getRepoStorageRoot).mockReturnValue('/mock/storage');
  });

  describe('performIngestion', () => {
    it('プロジェクトを調査し、LLMの結果を保存すること', async () => {
      vi.mocked(execSync).mockReturnValue('file1\nfile2' as any);
      vi.mocked(fs.readFile).mockResolvedValue('{"name": "test-project"}');
      vi.mocked(ai.generateContent).mockResolvedValue({ text: '# Ingestion Result', meta: {} });

      const result = await performIngestion();

      expect(result).toBe('# Ingestion Result');
      expect(prompt.buildIngestionPrompt).toHaveBeenCalled();
      expect(ai.generateContent).toHaveBeenCalledWith('ingestion prompt content');
    });

    it('Git管理下でない場合にフォールバックすること', async () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('git fail'); });
      vi.mocked(fs.readdir).mockResolvedValue(['fileA'] as any);
      vi.mocked(fs.readFile).mockResolvedValue('content');
      vi.mocked(ai.generateContent).mockResolvedValue({ text: 'result', meta: {} });

      await performIngestion();

      expect(fs.readdir).toHaveBeenCalled();
      expect(prompt.buildIngestionPrompt).toHaveBeenCalled();
    });
  });
});
