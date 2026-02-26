import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { searchKnowledge, saveKnowledge, formatKnowledgeForPrompt, KnowledgeResult, Knowledge } from '../src/knowledge';

vi.mock('fs/promises');
vi.mock('os', () => {
  return {
    homedir: () => '/mock/home'
  };
});

describe('knowledge utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchKnowledge', () => {
    it('クエリに基づいて正しくスコアリングし、関連度順に結果を返すこと', async () => {
      const mockFiles = ['file1.json', 'file2.json'];
      const mockKnowledge1: Knowledge = {
        summary: 'React hooks explanation',
        facts: ['useState is a hook'],
        inferences: [],
        keywords: ['react', 'hooks'],
        confidence_score: 1.0
      };
      const mockKnowledge2: Knowledge = {
        summary: 'Vue state management',
        facts: ['Vuex is for state'],
        inferences: [],
        keywords: ['vue', 'state'],
        confidence_score: 1.0
      };

      vi.mocked(fs.readdir).mockResolvedValue(mockFiles as any);
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(mockKnowledge1))
        .mockResolvedValueOnce(JSON.stringify(mockKnowledge2));

      // 'react' というキーワードで検索
      const results = await searchKnowledge(['react']);

      expect(results).toHaveLength(1);
      expect(results[0].filename).toBe('file1.json');
      expect(results[0].content.summary).toBe('React hooks explanation');
    });

    it('クエリが空の場合は空の配列を返すこと', async () => {
      const results = await searchKnowledge([]);
      expect(results).toHaveLength(0);
    });

    it('fs.readdirが失敗した場合は空の配列を返すこと', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
      const results = await searchKnowledge(['test']);
      expect(results).toHaveLength(0);
    });
  });

  describe('saveKnowledge', () => {
    it('知識をJSONとして保存し、ファイルパスを返すこと', async () => {
      const mockKnowledge: Knowledge = {
        summary: 'Test knowledge',
        facts: ['Fact 1'],
        inferences: [],
        keywords: ['test'],
        confidence_score: 0.9
      };

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      // accessが失敗することで、ファイルが存在しない（上書きではない）ことをシミュレート
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const filePath = await saveKnowledge('test-file', mockKnowledge);

      expect(fs.mkdir).toHaveBeenCalledWith(path.join('/mock/home', '.agents', 'knowledges'), { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join('/mock/home', '.agents', 'knowledges', 'test-file.json'),
        JSON.stringify(mockKnowledge, null, 2)
      );
      expect(filePath).toBe(path.join('/mock/home', '.agents', 'knowledges', 'test-file.json'));
    });

    it('ファイル名が重複する場合は連番を付けること', async () => {
      const mockKnowledge: Knowledge = {
        summary: 'Test knowledge',
        facts: [], inferences: [], keywords: [], confidence_score: 1.0
      };

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      
      // 1回目のaccessは成功（ファイルが存在する）、2回目のaccessは失敗（ファイルが存在しない）
      vi.mocked(fs.access)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const filePath = await saveKnowledge('test-file', mockKnowledge);

      // test-file-1.json として保存されるはず
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join('/mock/home', '.agents', 'knowledges', 'test-file-1.json'),
        JSON.stringify(mockKnowledge, null, 2)
      );
      expect(filePath).toBe(path.join('/mock/home', '.agents', 'knowledges', 'test-file-1.json'));
    });

    it('writeFileが失敗した場合はカスタムエラーメッセージでエラーを投げること', async () => {
      const mockKnowledge: Knowledge = {
        summary: 'Failing knowledge',
        facts: [], inferences: [], keywords: [], confidence_score: 1.0
      };

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      // writeFileが失敗するようにモック
      vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('Permission denied'));

      await expect(saveKnowledge('test-fail', mockKnowledge))
        .rejects.toThrow('知識の保存に失敗しました: test-fail.json - Permission denied');
    });
  });

  describe('formatKnowledgeForPrompt', () => {
    it('検索結果が空の場合、既定のメッセージを返すこと', () => {
      const formatted = formatKnowledgeForPrompt([]);
      expect(formatted).toBe('※関連する既知の知見なし');
    });

    it('検索結果を正しくマークダウン形式にフォーマットすること', () => {
      const mockResults: KnowledgeResult[] = [
        {
          filename: 'test.json',
          content: {
            summary: 'Test summary',
            facts: ['Fact A', 'Fact B'],
            inferences: ['Inference A'],
            keywords: ['key1', 'key2'],
            confidence_score: 1.0
          }
        }
      ];

      const formatted = formatKnowledgeForPrompt(mockResults);
      
      expect(formatted).toContain('### Knowledge: Test summary (Source: test.json)');
      expect(formatted).toContain('- **Facts**:');
      expect(formatted).toContain('  - Fact A');
      expect(formatted).toContain('  - Fact B');
      expect(formatted).toContain('- **Inferences**:');
      expect(formatted).toContain('  - Inference A');
      expect(formatted).toContain('- **Keywords**: key1, key2');
    });
  });
});
