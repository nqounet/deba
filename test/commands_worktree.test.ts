import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { execSync } from 'child_process';
import { worktreeAddCommand } from '../src/commands/worktree';

vi.mock('fs/promises');
vi.mock('child_process');
vi.mock('../src/utils/git', () => ({
  getMainRepoRoot: vi.fn(() => '/mock/deba')
}));

describe('commands/worktree module', () => {
  const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('worktreeAddCommand: 指定したリポジトリにworktreeを追加すること', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);

    await worktreeAddCommand('/target/repo', 'main', { name: 'wt1' });

    expect(execSync).toHaveBeenCalledWith(expect.stringContaining('git worktree add'), expect.objectContaining({ cwd: '/target/repo' }));
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('正常に作成されました'));
  });

  it('worktreeAddCommand: リポジトリが見つからない場合にエラー終了すること', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('not found'));
    await expect(worktreeAddCommand('/invalid', 'main', {})).rejects.toThrow('exit');
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('見つかりません'));
  });
});
