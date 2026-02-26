import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import yaml from 'yaml';
import { validateCommand, executeCommand } from '../src/commands/utils';
import * as validator from '../src/validator';
import * as dag from '../src/dag';
import * as runner from '../src/runner';
import * as snapshot from '../src/snapshot';

vi.mock('fs/promises');
vi.mock('../src/validator');
vi.mock('../src/dag');
vi.mock('../src/runner');
vi.mock('../src/snapshot');

describe('commands/utils module', () => {
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
  const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const mockWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // スパイをリセット
  });

  describe('validateCommand', () => {
    it('正しいYAMLとプランの場合、成功ログを表示すること', async () => {
      const mockYaml = {
        implementation_plan: { steps: [{ id: 1 }] }
      };
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(mockYaml));
      vi.mocked(validator.validatePhaseA).mockReturnValue({ isValid: true, errors: [], warnings: [] });
      vi.mocked(dag.validateAndBuildBatches).mockReturnValue({
        isValid: true,
        batches: [{ steps: [{ id: 1, parallelizable: true }] as any }],
        errors: []
      });

      await validateCommand('test.yaml');

      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Schema is valid'));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('DAG is valid'));
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('バリデーションに失敗した場合、process.exit(1) を呼び出すこと', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid yaml');
      vi.mocked(validator.validatePhaseA).mockReturnValue({ isValid: false, errors: ['error1'], warnings: [] });

      await expect(validateCommand('test.yaml')).rejects.toThrow('exit');
      expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Schema validation failed'));
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('executeCommand', () => {
    it('プランから指定したステップを実行できること', async () => {
      const mockPlan = {
        implementation_plan: {
          steps: [
            { id: '1', title: 'Step 1' },
            { id: '2', title: 'Step 2' }
          ]
        },
        cautions: ['caution1']
      };
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(mockPlan));
      vi.mocked(snapshot.generateTaskId).mockReturnValue('task-123');

      await executeCommand({ step: '1', plan: 'plan.yaml' });

      expect(runner.executeStep).toHaveBeenCalledWith(
        mockPlan.implementation_plan.steps[0],
        ['caution1'],
        'task-123'
      );
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Snapshot saved to snapshots/task-123'));
    });

    it('存在しないステップを指定した場合、エラーを投げること', async () => {
      const mockPlan = { implementation_plan: { steps: [] } };
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(mockPlan));

      await expect(executeCommand({ step: '99', plan: 'plan.yaml' }))
        .rejects.toThrow('Step ID "99" not found');
    });
  });
});
