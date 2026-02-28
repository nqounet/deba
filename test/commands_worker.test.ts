import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { workerCommand } from '../src/commands/worker';
import * as queue from '../src/utils/queue';
import * as runner from '../src/runner';
import * as ai from '../src/ai';
import * as prompt from '../src/prompt';

vi.mock('fs/promises');
vi.mock('../src/utils/git', () => ({
  getRepoStorageRoot: vi.fn(() => '/mock/repo'),
  createWorktree: vi.fn(() => '/mock/wt')
}));
vi.mock('../src/utils/queue');
vi.mock('../src/runner');
vi.mock('../src/ai');
vi.mock('../src/prompt');
vi.mock('../src/utils/config');

describe('commands/worker module', () => {
  const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  const mockSession = {
    sendMessage: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(queue.getQueueDirPath).mockReturnValue('/mock/queue');
    vi.mocked(ai.startChatSession).mockResolvedValue(mockSession as any);
    vi.mocked(prompt.buildWorkerEternalPrompt).mockResolvedValue('eternal prompt');
  });

  it('workerCommand: タスクがない場合に待機を指示されるケース', async () => {
    // タスクなしのキュー状態
    vi.mocked(fs.readdir).mockResolvedValue([] as any);
    // LLM が WAIT を返したと想定
    mockSession.sendMessage.mockResolvedValue({ text: '```json\n{"action": "WAIT", "reasoning": "empty"}\n```' });

    await workerCommand({ once: true });

    expect(ai.startChatSession).toHaveBeenCalled();
    expect(prompt.buildWorkerEternalPrompt).toHaveBeenCalled();
    expect(mockSession.sendMessage).toHaveBeenCalledWith('eternal prompt');
  });

  it('workerCommand: タスクがある場合に実行を指示されるケース', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['task1.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ taskId: 't1', id: 1, description: 'desc' }));
    
    // LLM が EXECUTE_TASK を返したと想定
    mockSession.sendMessage.mockResolvedValueOnce({ 
      text: '```json\n{"action": "EXECUTE_TASK", "task_file": "task1.json", "reasoning": "test"}\n```' 
    }).mockResolvedValueOnce({ text: 'ack' }); // 実行完了報告へのレスポンス

    vi.mocked(runner.executeStep).mockResolvedValue({ text: 'code' } as any);

    await workerCommand({ once: true });

    expect(queue.moveTask).toHaveBeenCalledWith('task1.json', 'todo', 'doing');
    expect(runner.executeStep).toHaveBeenCalled();
    expect(queue.moveTask).toHaveBeenCalledWith('task1.json', 'doing', 'done');
    // 実行完了の報告が送られていること
    expect(mockSession.sendMessage).toHaveBeenCalledWith(expect.stringContaining('TASK_COMPLETED: task1.json'));
  });
});
