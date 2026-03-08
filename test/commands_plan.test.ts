import { describe, it, expect, vi, beforeEach } from 'vitest';
import { planCommand } from '../src/commands/plan';
import * as ai from '../src/ai';
import * as prompt from '../src/prompt';
import * as queue from '../src/utils/queue';
import * as config from '../src/utils/config';

vi.mock('../src/ai');
vi.mock('../src/prompt', () => ({
  buildPlanningPrompt: vi.fn(),
  buildRepairPrompt: vi.fn()
}));
vi.mock('../src/utils/queue');
vi.mock('../src/utils/config');
vi.mock('../src/snapshot');

describe('commands/plan module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(config.loadConfig).mockResolvedValue({
      ai: {
        planning: { provider: 'gemini', model: 'planning-model' },
        execution: { provider: 'gemini', model: 'execution-model' }
      }
    } as any);
  });

  describe('planCommand', () => {
    it('正常系: LLMから正しいYAMLが返された場合、パースしてキューに入れること', async () => {
      vi.mocked(prompt.buildPlanningPrompt).mockResolvedValue('prompt text');
      vi.mocked(ai.generateContent).mockResolvedValue({
        text: '```json\n{"implementation_plan": {"steps": [{"id": 1, "description": "step1", "target_files": [], "parallelizable": false, "dependencies": []}]}, "requirements": {"goal": "test", "specs": [{"item": "s1", "reasoning": "r1"}], "acceptance_criteria": ["c1"]}, "cautions": [{"context": "ctx", "instruction": "ins"}]}\n```',
        meta: {}
      });

      await planCommand('user request', { file: [] });

      expect(prompt.buildPlanningPrompt).toHaveBeenCalledWith('user request', []);
      expect(ai.generateContent).toHaveBeenCalledWith('prompt text', { provider: 'gemini', model: 'planning-model' });
      expect(queue.enqueueStep).toHaveBeenCalled();
    });

    it('自己修復系: 初回のYAMLが不正な場合、修復を試みること', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(prompt.buildPlanningPrompt).mockResolvedValue('prompt');
      vi.mocked(prompt.buildRepairPrompt).mockResolvedValue('repair prompt');
      
      vi.mocked(ai.generateContent)
        .mockResolvedValueOnce({ text: 'invalid yaml', meta: {} })
        .mockResolvedValueOnce({
          text: '```json\n{"implementation_plan": {"steps": [{"id": 1, "description": "fixed", "target_files": [], "parallelizable": false, "dependencies": []}]}, "requirements": {"goal": "test", "specs": [{"item": "s1", "reasoning": "r1"}], "acceptance_criteria": ["c1"]}, "cautions": [{"context": "ctx", "instruction": "ins"}]}\n```',
          meta: {}
        });

      await planCommand('request', { file: [] });

      expect(prompt.buildRepairPrompt).toHaveBeenCalled();
      expect(ai.generateContent).toHaveBeenCalledWith('prompt', { provider: 'gemini', model: 'planning-model' });
      expect(ai.generateContent).toHaveBeenCalledWith('repair prompt', { provider: 'gemini', model: 'execution-model' });
      expect(queue.enqueueStep).toHaveBeenCalled();
    });

    it('修復失敗系: 修復後も不正な場合、エラーを表示すること', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(prompt.buildPlanningPrompt).mockResolvedValue('prompt');
      vi.mocked(prompt.buildRepairPrompt).mockResolvedValue('repair prompt');

      vi.mocked(ai.generateContent)
        .mockResolvedValueOnce({ text: 'invalid 1', meta: {} })
        .mockResolvedValueOnce({ text: 'invalid 2', meta: {} })
        .mockResolvedValueOnce({ text: 'invalid 3', meta: {} })
        .mockResolvedValueOnce({ text: 'invalid 4', meta: {} });

      await planCommand('request', { file: [] });
      expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Self-healing failed'));
    });
  });
});
