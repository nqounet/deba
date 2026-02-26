import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  buildPhaseAPrompt,
  buildPhaseBPrompt,
  buildReflectionPrompt,
  buildSkillSuggestionPrompt
} from '../src/prompt';
import { loadSkills } from '../src/skills';
import { searchKnowledge, formatKnowledgeForPrompt } from '../src/knowledge';
import { loadIngestion } from '../src/ingestion';

vi.mock('fs/promises');
vi.mock('../src/skills');
vi.mock('../src/knowledge', () => ({
  searchKnowledge: vi.fn(),
  formatKnowledgeForPrompt: vi.fn()
}));
vi.mock('../src/ingestion');
vi.mock('../src/utils/git', () => ({
  getRepoStorageRoot: () => '/mock/repo/root',
  getMainRepoRoot: () => '/mock/repo/main'
}));

describe('prompt module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildPhaseAPrompt', () => {
    it('プロンプトテンプレートに変数を注入してPhase Aプロンプトを構築すること', async () => {
      // モックの設定
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('Template: {{USER_REQUEST}}, {{PROJECT_SUMMARY}}, {{TARGET_SOURCE_CODE}}, {{SEMANTIC_MEMORY}}, {{RELATED_EPISODES}}')
        .mockResolvedValueOnce('mock file content'); // targetFilePaths 用
      
      vi.mocked(fs.access).mockRejectedValueOnce(new Error('ENOENT')); // episodesDirが存在しない場合をシミュレート
      vi.mocked(loadIngestion).mockResolvedValue('mock ingestion');
      vi.mocked(loadSkills).mockResolvedValue('mock skills');
      vi.mocked(searchKnowledge).mockResolvedValue([
        { filename: 'k1.json', content: { summary: 'K1', facts: ['F1'], inferences: [], keywords: [], confidence_score: 1 } }
      ]);
      vi.mocked(formatKnowledgeForPrompt).mockReturnValue('### Knowledge: K1');

      const result = await buildPhaseAPrompt('test request', ['target.ts']);

      expect(fs.readFile).toHaveBeenCalledTimes(2);
      expect(result).toContain('test request');
      expect(result).toContain('mock ingestion');
      expect(result).toContain('--- target.ts ---\nmock file content');
      expect(result).toContain('mock skills');
      expect(result).toContain('K1');
      expect(result).toContain('※記録なし'); // エピソードがない場合
    });

    it('プロンプトテンプレートの読み込みに失敗した場合、エラーを投げること', async () => {
      // テンプレートファイルの読み込みが失敗するように設定
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('ENOENT: file not found'));

      await expect(buildPhaseAPrompt('test request'))
        .rejects.toThrow('プロンプトテンプレートファイルの読み込みに失敗しました:');
    });

    it('エピソード記録が存在する場合、それらをプロンプトに含めること', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('Template: {{RELATED_EPISODES}}');
      vi.mocked(fs.access).mockResolvedValue(undefined); // episodesDirが存在
      vi.mocked(fs.readdir).mockResolvedValue(['2024-01-01_001.md'] as any);
      vi.mocked(fs.readFile).mockImplementation(async (p: any) => {
        if (p.includes('template')) return 'Template: {{RELATED_EPISODES}}';
        if (p.includes('2024-01-01_001.md')) return 'Episode 1 content';
        return '';
      });
      vi.mocked(loadIngestion).mockResolvedValue('');
      vi.mocked(loadSkills).mockResolvedValue('');
      vi.mocked(searchKnowledge).mockResolvedValue([]);
      vi.mocked(formatKnowledgeForPrompt).mockReturnValue('');

      const result = await buildPhaseAPrompt('request');
      expect(result).toContain('Episode 1 content');
    });
  });

  describe('buildPhaseBPrompt', () => {
    it('指示遂行型プロンプトを構築すること', () => {
      const result = buildPhaseBPrompt('Test step', 'File content', [{ context: 'CTX', instruction: 'Do this' }]);
      expect(result).toContain('Test step');
      expect(result).toContain('File content');
      expect(result).toContain('- [CTX] Do this');
    });
  });

  describe('buildReflectionPrompt', () => {
    it('自己評価および学び抽出用のプロンプトを構築すること', () => {
      const result = buildReflectionPrompt('Summary', 'Corrections', 'Skills');
      expect(result).toContain('Summary');
      expect(result).toContain('Corrections');
      expect(result).toContain('Skills');
      expect(result).toContain('reflection:');
    });
  });

  describe('buildSkillSuggestionPrompt', () => {
    it('スキル抽出用プロンプトを構築すること', () => {
      const result = buildSkillSuggestionPrompt('Task desc', 'Task result');
      expect(result).toContain('Task desc');
      expect(result).toContain('Task result');
      expect(result).toContain('```yaml');
    });
  });
});
