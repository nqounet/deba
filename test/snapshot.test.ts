import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { saveSnapshot } from '../src/snapshot';

vi.mock('../src/utils/git', () => ({
  getRepoStorageRoot: vi.fn(() => '/mock/repo')
}));
vi.mock('fs/promises');

describe('snapshot module', () => {
  const mockRepoRoot = '/mock/repo';
  const taskId = 'task-123';
  const snapshotDir = path.join(mockRepoRoot, 'snapshots', taskId);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveSnapshot', () => {
    it('スナップショットを複数のファイルに保存できること', async () => {
      const data = {
        input: 'user input',
        outputRaw: 'llm raw output',
        outputParsed: { key: 'value' },
        meta: { model: 'gpt-4' }
      };

      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const resultDir = await saveSnapshot(taskId, data);

      expect(resultDir).toBe(snapshotDir);
      expect(fs.mkdir).toHaveBeenCalledWith(snapshotDir, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledTimes(4); // input, output_raw, output_parsed, meta

      // 各ファイルのパスを確認
      expect(fs.writeFile).toHaveBeenCalledWith(path.join(snapshotDir, 'input.md'), 'user input', 'utf-8');
      expect(fs.writeFile).toHaveBeenCalledWith(path.join(snapshotDir, 'output_raw.txt'), 'llm raw output', 'utf-8');
      expect(fs.writeFile).toHaveBeenCalledWith(path.join(snapshotDir, 'output_parsed.yml'), expect.stringContaining('key: value'), 'utf-8');
      expect(fs.writeFile).toHaveBeenCalledWith(path.join(snapshotDir, 'meta.json'), JSON.stringify(data.meta, null, 2), 'utf-8');
    });

    it('プレフィックスを指定して保存できること', async () => {
      const data = {
        input: 'input',
        outputRaw: 'raw',
        meta: {}
      };

      await saveSnapshot(taskId, data, 'test_prefix');

      expect(fs.writeFile).toHaveBeenCalledWith(path.join(snapshotDir, 'test_prefix_input.md'), 'input', 'utf-8');
    });

    it('outputParsed が文字列の場合、そのまま保存すること', async () => {
        const data = {
            input: 'input',
            outputRaw: 'raw',
            outputParsed: 'string-yaml-content',
            meta: {}
        };
        await saveSnapshot(taskId, data);
        expect(fs.writeFile).toHaveBeenCalledWith(path.join(snapshotDir, 'output_parsed.yml'), 'string-yaml-content', 'utf-8');
    });
  });
});
