import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildPlanningPrompt,
  buildExecutionPrompt,
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
vi.mock('../src/episode', () => ({
  loadRecentEpisodes: vi.fn().mockResolvedValue('※記録なし')
}));

import { loadRecentEpisodes } from '../src/episode';

describe('prompt module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildPlanningPrompt', () => {
    const mockContext = {
      ingestion: 'mock ingestion',
      skills: 'mock skills',
      episodes: 'mock episodes',
      knowledgePrompt: '### Knowledge: K1'
    };

    it('プロンプトテンプレートに変数を注入してPlanningプロンプトを構築すること', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{{USER_REQUEST}} {{PROJECT_SUMMARY}} {{SEMANTIC_MEMORY}}');
      vi.mocked(formatKnowledgeForPrompt).mockReturnValue('### Knowledge: K1');

      const result = await buildPlanningPrompt('test request', mockContext, ['target.ts']);

      expect(result).toContain('test request');
      expect(result).toContain('### Knowledge: K1');
      expect(fs.readFile).toHaveBeenCalled();
    });

    it('プロンプトテンプレートの読み込みに失敗した場合、エラーを投げること', async () => {
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('ENOENT: file not found'));

      await expect(buildPlanningPrompt('test request', mockContext))
        .rejects.toThrow('テンプレートファイルの読み込みに失敗しました:');
    });

    it('エピソード記録が存在する場合、それらをプロンプトに含めること', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('templates/planning.md')) return '{{RELATED_EPISODES}}';
        return '';
      });
      vi.mocked(loadRecentEpisodes).mockResolvedValue('Recent Episode content');

      const ctxWithEpisode = { ...mockContext, episodes: 'Recent Episode content' };
      const result = await buildPlanningPrompt('request', ctxWithEpisode);
      expect(result).toContain('Recent Episode content');
    });

    it('機密情報や巨大なファイルがtarget_filesに含まれていた場合、除外されること', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('templates/planning.md')) return '{{TARGET_SOURCE_CODE}}';
        return 'dummy content';
      });

      const badPaths = [
        '.env',
        '.env.local',
        'node_modules/foo/index.js',
        '.git/config',
        'package-lock.json',
        'src/valid.ts'
      ];

      const result = await buildPlanningPrompt('request', mockContext, badPaths);
      
      // valid.ts のみが読み込まれ、その他は除外されるため 'dummy content' が1回だけ含まれるはず
      expect(result).toContain('--- src/valid.ts ---');
      expect(result).not.toContain('.env');
      expect(result).not.toContain('node_modules');
      expect(result).not.toContain('.git/config');
      expect(result).not.toContain('package-lock.json');
    });

    it('すべてのファイルが除外された場合、フォールバックメッセージが含まれること', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('templates/planning.md')) return '{{TARGET_SOURCE_CODE}}';
        return 'dummy content';
      });

      const result = await buildPlanningPrompt('request', mockContext, ['node_modules/a.ts', '.env']);
      
      expect(result).toContain('※有効な（機密情報を含まない）変更対象ファイルなし');
    });
  });

  describe('buildExecutionPrompt', () => {
    it('指示遂行型プロンプトを構築すること', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{{STEP_DESCRIPTION}} {{TARGET_FILE_CONTENT}} {{CAUTIONS}}');
      const result = await buildExecutionPrompt('Test step', 'File content', [{ context: 'CTX', instruction: 'Do this' }]);
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
