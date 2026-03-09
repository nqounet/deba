import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { reviewCommand } from '../src/commands/review';
import * as gitUtils from '../src/utils/git';
import * as episode from '../src/episode';
import * as growthLog from '../src/growthLog';
import * as ai from '../src/ai';
import * as yamlParser from '../src/yamlParser';
import * as knowledge from '../src/knowledge';
import * as configUtils from '../src/utils/config';

vi.mock('fs/promises');
vi.mock('../src/utils/git', () => ({
  getRepoStorageRoot: vi.fn(() => '/mock/repo'),
  getWorktreePath: vi.fn(() => '/mock/wt'),
  mergeWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  getMainRepoRoot: vi.fn(() => '/mock/main')
}));
vi.mock('../src/episode');
vi.mock('../src/growthLog');
vi.mock('../src/ai');
vi.mock('../src/yamlParser');
vi.mock('../src/knowledge');
vi.mock('../src/utils/config');
vi.mock('child_process', () => ({
  execSync: vi.fn(() => 'mocked diff')
}));

describe('commands/review module', () => {
  const mockAiConfig = {
    planning: { provider: 'gemini', model: 'planning-model' },
    execution: { provider: 'gemini', model: 'execution-model' }
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configUtils.loadConfig).mockResolvedValue({ ai: mockAiConfig } as any);
  });

  it('承認時: エピソードを保存し、Worktreeをマージ・削除すること', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('request content');
    vi.mocked(fs.readdir).mockResolvedValue(['step_1_output_raw.txt'] as any);

    await reviewCommand('task1', { approve: true, yes: true });

    expect(episode.saveEpisode).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(gitUtils.mergeWorktree).toHaveBeenCalledWith('task1');
    expect(gitUtils.removeWorktree).toHaveBeenCalled();
  });

  it('非承認時: Reflectionを実行し、学びを保存すること', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('request');
    vi.mocked(fs.readdir).mockResolvedValue([]);
    vi.mocked(ai.generateContent).mockResolvedValue({ text: 'reflection yaml', meta: {} } as any);
    vi.mocked(yamlParser.extractAndParseYaml).mockReturnValue({
      parsedObject: { learnings: [{ summary: 'learned' }] }
    } as any);

    await reviewCommand('task2', { approve: false, message: 'needs fix' });

    expect(episode.saveEpisode).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(ai.generateContent).toHaveBeenCalledWith(expect.any(String), mockAiConfig.execution, expect.any(String));
    expect(growthLog.appendGrowthLog).toHaveBeenCalled();
    expect(knowledge.saveKnowledge).toHaveBeenCalled();
  });
});
