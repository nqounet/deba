import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ai from '../src/ai';
import * as snapshot from '../src/snapshot';
import * as prompt from '../src/prompt';
import * as yamlParser from '../src/yamlParser';
import * as validator from '../src/validator';
import * as queue from '../src/utils/queue';
import * as config from '../src/utils/config';
import { planCommand } from '../src/commands/plan';
import yaml from 'yaml';

vi.mock('../src/ai');
vi.mock('../src/snapshot');
vi.mock('../src/prompt');
vi.mock('../src/yamlParser');
vi.mock('../src/validator');
vi.mock('../src/utils/queue');
vi.mock('../src/utils/config');

describe('commands/plan module', () => {
  const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  const mockWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

  const mockConfig = {
    ai: { model: 'main-model', flash_model: 'flash-model' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(config.loadConfig).mockResolvedValue(mockConfig as any);
    vi.mocked(snapshot.generateTaskId).mockReturnValue('task-123');
    vi.mocked(snapshot.saveSnapshot).mockResolvedValue('/mock/snapshot/dir');
  });

  describe('planCommand', () => {
    it('正常系: LLMから正しいYAMLが返された場合、パースしてキューに入れること', async () => {
      const mockParsed = {
        implementation_plan: {
          steps: [{ id: 1, title: 'Step 1' }]
        }
      };

      vi.mocked(prompt.buildPhaseAPrompt).mockResolvedValue('prompt text');
      vi.mocked(ai.generateContent).mockResolvedValue({ text: 'llm output', meta: {} } as any);
      vi.mocked(yamlParser.extractAndParseYaml).mockReturnValue({
        yamlRaw: 'yaml raw',
        parsedObject: mockParsed,
        error: undefined
      });
      vi.mocked(validator.validatePhaseA).mockReturnValue({ isValid: true, errors: [], warnings: [] });

      await planCommand('user request', { file: [] });

      expect(prompt.buildPhaseAPrompt).toHaveBeenCalledWith('user request', []);
      expect(ai.generateContent).toHaveBeenCalledWith('prompt text', 'main-model');
      expect(queue.initQueueDirs).toHaveBeenCalled();
      expect(queue.enqueueStep).toHaveBeenCalledWith('task-123', mockParsed.implementation_plan.steps[0]);
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Enqueuing 1 steps'));
    });

    it('自己修復系: 初回のYAMLが不正な場合、修復を試みること', async () => {
      const mockParsed = { implementation_plan: { steps: [{ id: 1 }] } };

      vi.mocked(prompt.buildPhaseAPrompt).mockResolvedValue('prompt');
      // 1回目: 失敗、2回目: 成功
      vi.mocked(ai.generateContent)
        .mockResolvedValueOnce({ text: 'bad output', meta: {} } as any)
        .mockResolvedValueOnce({ text: 'good output', meta: {} } as any);
      
      // 1回目: エラーあり、2回目: エラーなし
      vi.mocked(yamlParser.extractAndParseYaml)
        .mockReturnValueOnce({ yamlRaw: '', parsedObject: null, error: 'syntax error' })
        .mockReturnValueOnce({ yamlRaw: 'good raw', parsedObject: mockParsed, error: undefined });
      
      vi.mocked(validator.validatePhaseA).mockReturnValue({ isValid: true, errors: [], warnings: [] });

      await planCommand('request', {});

      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('YAML validation/parse error'));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Attempting self-healing'));
      // 修復には flash_model が使われることを確認
      expect(ai.generateContent).toHaveBeenCalledWith(expect.stringContaining('エラー詳細: syntax error'), 'flash-model');
      expect(queue.enqueueStep).toHaveBeenCalled();
    });

    it('修復失敗系: 修復後も不正な場合、エラーを表示すること', async () => {
      vi.mocked(prompt.buildPhaseAPrompt).mockResolvedValue('prompt');
      vi.mocked(ai.generateContent).mockResolvedValue({ text: 'bad', meta: {} } as any);
      vi.mocked(yamlParser.extractAndParseYaml).mockReturnValue({ yamlRaw: '', parsedObject: null, error: 'permanent error' });

      await planCommand('request', {});

      expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Self-healing failed'));
      expect(queue.enqueueStep).not.toHaveBeenCalled();
    });
  });
});
