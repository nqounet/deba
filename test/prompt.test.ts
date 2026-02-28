import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildPhaseAPrompt,
  buildPhaseBPrompt,
  buildReflectionPrompt,
  buildSkillSuggestionPrompt
} from '../src/prompt';
import { searchKnowledge, formatKnowledgeForPrompt } from '../src/knowledge';
import * as fs from 'fs/promises';

vi.mock('fs/promises');
vi.mock('../src/knowledge', () => ({
  searchKnowledge: vi.fn().mockResolvedValue([]),
  formatKnowledgeForPrompt: vi.fn()
}));

describe('prompt module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildPhaseAPrompt', () => {
    it('プロンプトテンプレートに変数を注入してPhase Aプロンプトを構築すること', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{{USER_REQUEST}} {{PROJECT_SUMMARY}} {{SEMANTIC_MEMORY}}');
      vi.mocked(formatKnowledgeForPrompt).mockReturnValue('### Knowledge: K1');

      const result = await buildPhaseAPrompt('test request', ['target.ts']);

      expect(result).toContain('test request');
      expect(result).toContain('### Knowledge: K1');
      expect(fs.readFile).toHaveBeenCalled();
    });

    it('プロンプトテンプレートの読み込みに失敗した場合、エラーを投げること', async () => {
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('ENOENT: file not found'));

      await expect(buildPhaseAPrompt('test request'))
        .rejects.toThrow('テンプレートファイルの読み込みに失敗しました:');
    });

    it('エピソード記録が存在する場合、それらをプロンプトに含めること', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('templates/phase_a.md')) return '{{RELATED_EPISODES}}';
        if (typeof path === 'string' && path.includes('brain/episodes')) return 'Recent Episode content';
        return '';
      });
      vi.mocked(fs.readdir).mockResolvedValue(['2024-01-01_001.md'] as any);

      const result = await buildPhaseAPrompt('request');
      expect(result).toContain('Recent Episode content');
    });
  });

  describe('buildPhaseBPrompt', () => {
    it('指示遂行型プロンプトを構築すること', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{{STEP_DESCRIPTION}} {{TARGET_FILE_CONTENT}} {{CAUTIONS}}');
      const result = await buildPhaseBPrompt('Test step', 'File content', [{ context: 'CTX', instruction: 'Do this' }]);
      expect(result).toContain('Test step');
      expect(result).toContain('File content');
      expect(result).toContain('- [CTX] Do this');
    });
  });

  describe('buildReflectionPrompt', () => {
    it('自己評価および学び抽出用のプロンプトを構築すること', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{{EPISODE_SUMMARY}} {{USER_CORRECTIONS}} {{CURRENT_SKILLS}}');
      const result = await buildReflectionPrompt('Summary', 'Corrections', 'Skills');
      expect(result).toContain('Summary');
      expect(result).toContain('Corrections');
      expect(result).toContain('Skills');
    });
  });

  describe('buildSkillSuggestionPrompt', () => {
    it('スキル抽出用プロンプトを構築すること', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{{TASK_DESCRIPTION}} {{TASK_RESULT}} ```yaml');
      const result = await buildSkillSuggestionPrompt('Task desc', 'Task result');
      expect(result).toContain('Task desc');
      expect(result).toContain('Task result');
      expect(result).toContain('```yaml');
    });
  });
});
