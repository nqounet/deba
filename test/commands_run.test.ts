import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import yaml from 'yaml';

// モックを最優先
vi.mock('../src/utils/git', () => ({
  getRepoStorageRoot: vi.fn(() => '/mock/repo'),
  getMainRepoRoot: vi.fn(() => '/mock/main'),
  createWorktree: vi.fn(() => '/mock/wt')
}));
vi.mock('fs/promises');
vi.mock('../src/ai');
vi.mock('../src/snapshot');
vi.mock('../src/prompt');
vi.mock('../src/yamlParser');
vi.mock('../src/validator');
vi.mock('../src/dag');
vi.mock('../src/runner');
vi.mock('../src/utils/queue');
vi.mock('../src/skills');

import { runCommand, runPlanCommand } from '../src/commands/run';
import * as ai from '../src/ai';
import * as snapshot from '../src/snapshot';
import * as prompt from '../src/prompt';
import * as yamlParser from '../src/yamlParser';
import * as validator from '../src/validator';
import * as dag from '../src/dag';
import * as runner from '../src/runner';
import * as queue from '../src/utils/queue';
import * as skills from '../src/skills';

describe('commands/run module', () => {
  const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(snapshot.generateTaskId).mockReturnValue('task-123');
    vi.mocked(skills.listSkills).mockResolvedValue({ count: 0, display: '' });
  });

  describe('runCommand', () => {
    it('Phase AからBまでを一気通貫で実行すること', async () => {
      const mockParsed = { implementation_plan: { steps: [{ id: 1 }] } };
      vi.mocked(prompt.buildPhaseAPrompt).mockResolvedValue('prompt');
      vi.mocked(ai.generateContent).mockResolvedValue({ text: 'output', meta: {} } as any);
      vi.mocked(yamlParser.extractAndParseYaml).mockReturnValue({
        parsedObject: mockParsed, error: undefined
      } as any);
      vi.mocked(validator.validatePhaseA).mockReturnValue({ isValid: true, errors: [], warnings: [] });
      vi.mocked(dag.validateAndBuildBatches).mockReturnValue({
        isValid: true, batches: [{ steps: [] }], errors: []
      });

      await runCommand('request', { file: [] });

      expect(runner.executeBatches).toHaveBeenCalled();
      expect(queue.moveAllSteps).toHaveBeenCalledWith('task-123', 'todo', 'done');
    });
  });

  describe('runPlanCommand', () => {
    it('既存の計画ファイルを読み込んで実行すること', async () => {
      const mockPlan = { implementation_plan: { steps: [{ id: 1 }] } };
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(mockPlan));
      vi.mocked(validator.validatePhaseA).mockReturnValue({ isValid: true, errors: [], warnings: [] });
      vi.mocked(dag.validateAndBuildBatches).mockReturnValue({
        isValid: true, batches: [{ steps: [] }], errors: []
      });

      await runPlanCommand('task_20240101_000000_abc/phase_a_output_parsed.yml');

      expect(runner.executeBatches).toHaveBeenCalled();
      expect(queue.moveAllSteps).toHaveBeenCalledWith('task_20240101_000000_abc', 'todo', 'done');
    });
  });
});
