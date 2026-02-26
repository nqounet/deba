import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { workerCommand } from '../src/commands/worker';
import * as queue from '../src/utils/queue';
import * as runner from '../src/runner';
import * as gitUtils from '../src/utils/git';
import * as ai from '../src/ai';
import * as configUtils from '../src/utils/config';

vi.mock('fs/promises');
vi.mock('../src/utils/git', () => ({
  getRepoStorageRoot: vi.fn(() => '/mock/repo'),
  createWorktree: vi.fn(() => '/mock/wt')
}));
vi.mock('../src/utils/queue');
vi.mock('../src/runner');
vi.mock('../src/ai');
vi.mock('../src/utils/config');

describe('commands/worker module', () => {
  const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(queue.getQueueDirPath).mockReturnValue('/mock/queue');
    vi.mocked(configUtils.loadConfig).mockResolvedValue({ ai: { flash_model: 'flash' } } as any);
  });

  it('workerCommand: 1回実行して待機または終了すること', async () => {
    // タスクなしのケース
    vi.mocked(fs.readdir).mockResolvedValue([] as any);
    await workerCommand({ once: true });
    expect(queue.initQueueDirs).toHaveBeenCalled();
  });

  it('workerCommand: タスクがある場合に実行すること', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['task1.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ taskId: 't1', id: 1, description: 'desc' }));
    vi.mocked(runner.executeStep).mockResolvedValue({ text: 'code' } as any);
    vi.mocked(ai.generateContent).mockResolvedValue({ text: 'suggestion', meta: {} } as any);

    await workerCommand({ once: true });

    expect(queue.moveTask).toHaveBeenCalledWith('task1.json', 'todo', 'doing');
    expect(runner.executeStep).toHaveBeenCalled();
    expect(queue.moveTask).toHaveBeenCalledWith('task1.json', 'doing', 'done');
  });
});
