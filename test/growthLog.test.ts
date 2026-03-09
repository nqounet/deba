import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { appendGrowthLog, getPendingLearnings, markAsApproved, LearningEntry } from '../src/growthLog';
import { getRepoStorageRoot } from '../src/utils/git-base';

// モックの設定
vi.mock('../src/utils/git-base', () => ({
  getRepoStorageRoot: vi.fn(() => '/mock/repo')
}));
vi.mock('../src/utils/git-worktree', () => ({
  getRepoStorageRoot: vi.fn(() => '/mock/repo')
}));
vi.mock('fs/promises');

describe('growthLog module', () => {
  const mockRepoRoot = '/mock/repo';
  const growthLogDir = path.join(mockRepoRoot, 'brain', 'growth_log');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRepoStorageRoot).mockReturnValue(mockRepoRoot);
  });

  describe('appendGrowthLog', () => {
    it('新規ファイルを作成して学びを追記できること', async () => {
      const entry: LearningEntry = {
        summary: 'New learning',
        generalizability: 'high',
        relatedSkills: 'new',
        sourceEpisode: 'ep1.md',
        proposedRule: 'rule1'
      };

      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const filepath = await appendGrowthLog(entry);

      expect(fs.mkdir).toHaveBeenCalledWith(growthLogDir, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalled();
      
      const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(content).toContain('# Growth Log:');
      expect(content).toContain('### 学び: New learning');
      expect(content).toContain('- **汎用性**: 高い');
      expect(content).toContain('- **提案ルール**: rule1');
    });

    it('既存のファイルに学びを追記できること', async () => {
      const entry: LearningEntry = {
        summary: 'Second learning',
        generalizability: 'medium',
        relatedSkills: 'reinforce',
        sourceEpisode: 'ep2.md'
      };

      vi.mocked(fs.readFile).mockResolvedValue(`# Existing Content\n`);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await appendGrowthLog(entry);

      const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(content).toContain('# Existing Content');
      expect(content).toContain('### 学び: Second learning');
      expect(content).toContain('- **汎用性**: 中程度');
    });
  });

  describe('getPendingLearnings', () => {
    it('承認待ちの項目を正しく抽出できること', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['2024-01.md'] as any);
      vi.mocked(fs.readFile).mockResolvedValue(`
# Growth Log
## 2024-01-01
### 学び: Learning 1
- **由来エピソード**: ep1.md
- **汎用性**: 高い
- **既存スキルとの関係**: new
- **承認状態**: 🟡 ユーザー承認待ち
- **提案ルール**: rule1

### 学び: Learning 2
- **承認状態**: ✅ 承認済み
`);

      const pending = await getPendingLearnings();
      expect(pending).toHaveLength(1);
      expect(pending[0].summary).toBe('Learning 1');
      expect(pending[0].generalizability).toBe('high');
      expect(pending[0].proposedRule).toBe('rule1');
    });

    it('ディレクトリがない場合に空配列を返すこと', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
      const pending = await getPendingLearnings();
      expect(pending).toEqual([]);
    });
  });

  describe('markAsApproved', () => {
    it('承認待ちステータスを承認済みに更新できること', async () => {
      const filepath = '/mock/repo/brain/growth_log/2024-01.md';
      const originalContent = `
### 学び: Target Learning
- **承認状態**: 🟡 ユーザー承認待ち
`;
      vi.mocked(fs.readFile).mockResolvedValue(originalContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await markAsApproved('Target Learning', filepath);

      const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(content).toContain('- **承認状態**: ✅ 承認済み');
      expect(content).not.toContain('🟡 ユーザー承認待ち');
    });

    it('指定したサマリーが見つからない場合は更新しないこと', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(`No match here`);
      await markAsApproved('Target', 'file.md');
      expect(fs.writeFile).not.toHaveReturned();
    });
  });
});
