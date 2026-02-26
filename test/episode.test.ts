import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { saveEpisode, EpisodeData } from '../src/episode';
import { getRepoStorageRoot } from '../src/utils/git';

// モックの設定
vi.mock('../src/utils/git', () => ({
  getRepoStorageRoot: vi.fn(() => '/mock/repo')
}));
vi.mock('fs/promises');

describe('episode module', () => {
  const mockRepoRoot = '/mock/repo';
  const episodesDir = path.join(mockRepoRoot, 'brain', 'episodes');

  beforeEach(() => {
    vi.clearAllMocks();
    // すでにファクトリで設定しているが、念のため再設定
    vi.mocked(getRepoStorageRoot).mockReturnValue(mockRepoRoot);
  });

  it('エピソードを正常に保存できること', async () => {
    const episode: EpisodeData = {
      taskId: 'task-123',
      request: 'test request',
      stepsExecuted: ['step 1', 'step 2'],
      userFeedback: 'approved',
      success: true,
      selfAssessment: 'all good'
    };

    // readdirのモック（既存ファイルなし）
    vi.mocked(fs.readdir).mockResolvedValue([] as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);

    const filepath = await saveEpisode(episode);

    expect(fs.mkdir).toHaveBeenCalledWith(episodesDir, { recursive: true });
    expect(fs.readdir).toHaveBeenCalledWith(episodesDir);
    expect(fs.writeFile).toHaveBeenCalled();
    
    // ファイル名が日付形式であることを確認
    const filename = path.basename(filepath);
    expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}_001\.md$/);
    
    // 書き込み内容の検証
    const callArgs = vi.mocked(fs.writeFile).mock.calls[0];
    const content = callArgs[1] as string;
    expect(content).toContain('# Episode: task-123');
    expect(content).toContain('- **タスクID**: task-123');
    expect(content).toContain('- **ユーザー指示**: test request');
    expect(content).toContain('  - step 1');
    expect(content).toContain('  - step 2');
    expect(content).toContain('- **結果**: ✅ 承認');
    expect(content).toContain('- **自己評価**: all good');
  });

  it('同日の既存ファイルがある場合、連番がインクリメントされること', async () => {
    const episode: EpisodeData = {
      taskId: 'task-124',
      request: 'another request',
      stepsExecuted: [],
      userFeedback: 'approved',
      success: true
    };

    const today = new Date().toISOString().split('T')[0];
    vi.mocked(fs.readdir).mockResolvedValue([
      `${today}_001.md`,
      `${today}_002.md`,
      '2020-01-01_001.md' // 過去の日付
    ] as any);

    const filepath = await saveEpisode(episode);
    const filename = path.basename(filepath);
    expect(filename).toBe(`${today}_003.md`);
  });

  it('失敗したエピソード（修正あり）を保存できること', async () => {
    const episode: EpisodeData = {
      taskId: 'task-125',
      request: 'failed request',
      stepsExecuted: ['step 1'],
      userFeedback: 'please fix typo',
      success: false
    };

    vi.mocked(fs.readdir).mockResolvedValue([] as any);

    await saveEpisode(episode);

    const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(content).toContain('- **結果**: 🔧 修正あり');
    expect(content).toContain('- **ユーザーフィードバック**: please fix typo');
  });

  it('readdirが失敗しても（ディレクトリがない等）、連番001で保存されること', async () => {
    const episode: EpisodeData = {
      taskId: 'task-126',
      request: 'test',
      stepsExecuted: [],
      userFeedback: 'approved',
      success: true
    };

    vi.mocked(fs.readdir).mockRejectedValue(new Error('Directory not found'));

    const filepath = await saveEpisode(episode);
    expect(path.basename(filepath)).toMatch(/_001\.md$/);
  });
});
