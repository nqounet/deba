import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSkills, listSkills, promoteToSkill } from '../src/skills';

vi.mock('../src/utils/git-base', () => ({
  getRepoStorageRoot: vi.fn(() => '/mock/repo')
}));
vi.mock('../src/utils/git-worktree', () => ({
  getRepoStorageRoot: vi.fn(() => '/mock/repo')
}));
vi.mock('fs/promises');

describe('skills module', () => {
  const mockRepoRoot = '/mock/repo';
  const skillsDir = path.join(mockRepoRoot, 'brain', 'skills');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadSkills', () => {
    it('スキルファイルを結合して返すこと', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['skill1.md', 'skill2.md'] as any);
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('content1')
        .mockResolvedValueOnce('content2');

      const result = await loadSkills();

      expect(result).toContain('### skill1.md');
      expect(result).toContain('content1');
      expect(result).toContain('### skill2.md');
      expect(result).toContain('content2');
    });

    it('スキルがない場合、空文字を返すこと', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([] as any);
      const result = await loadSkills();
      expect(result).toBe('');
    });

    it('エラーが発生した場合、空文字を返すこと', async () => {
        vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
        const result = await loadSkills();
        expect(result).toBe('');
      });
  });

  describe('listSkills', () => {
    it('スキルの一覧を整形して返すこと', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['git.md'] as any);
      vi.mocked(fs.readFile).mockResolvedValue(`- rule 1\n- rule 2`);

      const result = await listSkills();

      expect(result.count).toBe(1);
      expect(result.display).toContain('📚 獲得スキル: 1件');
      expect(result.display).toContain('### git');
      expect(result.display).toContain('- rule 1');
    });

    it('リスト内のルールがない場合、内容の一部を表示すること', async () => {
        vi.mocked(fs.readdir).mockResolvedValue(['other.md'] as any);
        vi.mocked(fs.readFile).mockResolvedValue('Plain text content');
  
        const result = await listSkills();
        expect(result.display).toContain('Plain text content...');
    });

    it('スキルがない場合、適切なメッセージを返すこと', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([] as any);
      const result = await listSkills();
      expect(result.display).toContain('獲得スキル: なし');
    });

    it('エラーが発生した場合、エラーメッセージを返すこと', async () => {
        vi.mocked(fs.readdir).mockRejectedValue(new Error('FAIL'));
        const result = await listSkills();
        expect(result.display).toContain('読み込みエラー');
      });
  });

  describe('promoteToSkill', () => {
    it('学びをスキルファイルに昇格させること', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const path = await promoteToSkill('New Rule', 'projectA');

      expect(path).toContain('projectA_conventions.md');
      expect(fs.writeFile).toHaveBeenCalledWith(path, expect.stringContaining('- New Rule'), 'utf-8');
    });

    it('既存のスキルファイルに追記すること', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(`# Existing\n`);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  
        const path = await promoteToSkill('Appended Rule');
  
        expect(fs.writeFile).toHaveBeenCalledWith(path, expect.stringContaining('# Existing'), 'utf-8');
        expect(fs.writeFile).toHaveBeenCalledWith(path, expect.stringContaining('- Appended Rule'), 'utf-8');
      });
  });
});
