import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCommand, runPlanCommand } from '../src/commands/run';
import * as ai from '../src/ai';
import * as prompt from '../src/prompt';
import * as fs from 'fs/promises';
import * as configUtils from '../src/utils/config';

vi.mock('../src/ai');
vi.mock('../src/prompt');
vi.mock('fs/promises');
vi.mock('../src/snapshot');
vi.mock('../src/utils/config');
vi.mock('../src/dag', () => ({
  validateAndBuildBatches: vi.fn().mockReturnValue({ isValid: true, batches: [], errors: [] })
}));
vi.mock('../src/runner');
vi.mock('../src/skills', () => ({
  listSkills: vi.fn().mockResolvedValue({ count: 0, display: '' })
}));
vi.mock('../src/utils/git', () => ({
  getMainRepoRoot: vi.fn().mockReturnValue('/mock/root'),
  getRepoStorageRoot: vi.fn().mockReturnValue('/mock/storage'),
  createWorktree: vi.fn().mockReturnValue('/mock/worktree')
}));

const validPhaseA = {
  requirements: {
    goal: "test goal",
    specs: [{ item: "spec1", reasoning: "reason1" }],
    acceptance_criteria: ["criteria1"]
  },
  implementation_plan: {
    steps: [{ id: 1, description: "step1", target_files: ["f1"], parallelizable: false, dependencies: [] }]
  },
  cautions: [{ context: "ctx", instruction: "ins" }]
};

describe('commands/run module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configUtils.loadConfig).mockResolvedValue({
      ai: {
        planning: { provider: 'gemini', model: 'planning-model' },
        execution: { provider: 'gemini', model: 'execution-model' }
      }
    } as any);
  });

  describe('runCommand', () => {
    it('正常系: 設計から実行までフローが回ること', async () => {
      vi.mocked(prompt.buildPlanningPrompt).mockResolvedValue('prompt');
      vi.mocked(ai.generateContent).mockResolvedValue({
        text: '```json\n' + JSON.stringify(validPhaseA) + '\n```',
        meta: {}
      });
      vi.mocked(fs.readdir).mockResolvedValue([]);

      await runCommand('request', {});

      expect(prompt.buildPlanningPrompt).toHaveBeenCalled();
      expect(ai.generateContent).toHaveBeenCalledWith('prompt', { provider: 'gemini', model: 'planning-model' });
    });
  });

  describe('runPlanCommand', () => {
    it('既存の計画ファイルを読み込んで実行すること', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validPhaseA));
      vi.mocked(fs.readdir).mockResolvedValue([]);
      
      await runPlanCommand('plan.json');

      expect(fs.readFile).toHaveBeenCalledWith('plan.json', 'utf-8');
    });
  });
});
