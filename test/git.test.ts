import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { 
  getRemoteOriginUrl, 
  getRepoStorageRoot, 
  getMainRepoRoot, 
  getWorktreePath,
  getWorktreesToClean,
  createWorktree,
  removeWorktree,
  mergeWorktree,
  cleanWorktrees
} from '../src/utils/git';

vi.mock('child_process');
vi.mock('fs');
vi.mock('os');

describe('git utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/home/user');
  });

  describe('getRemoteOriginUrl', () => {
    it('git remote -v の出力から origin の fetch URL を取得できること', () => {
      const mockOutput = `origin	ssh://git@github.com/nqounet/deba.git (fetch)
origin	ssh://git@github.com/nqounet/deba.git (push)
`;
      vi.mocked(execSync).mockReturnValue(mockOutput as any);

      const url = getRemoteOriginUrl();
      expect(url).toBe('ssh://git@github.com/nqounet/deba.git');
      expect(execSync).toHaveBeenCalledWith('git remote -v', { encoding: 'utf8' });
    });

    it('HTTPS URL の場合も正しく取得できること', () => {
      const mockOutput = `origin	https://github.com/nqounet/deba.git (fetch)
`;
      vi.mocked(execSync).mockReturnValue(mockOutput as any);

      const url = getRemoteOriginUrl();
      expect(url).toBe('https://github.com/nqounet/deba.git');
    });

    it('origin が見つからない場合にエラーを投げること', () => {
      vi.mocked(execSync).mockReturnValue(`upstream	ssh://... (fetch)
` as any);
      expect(() => getRemoteOriginUrl()).toThrow('origin remote not found');
    });

    it('execSync が失敗した場合にエラーを投げること', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('command failed');
      });
      expect(() => getRemoteOriginUrl()).toThrow(/Git origin remote is required/);
    });
  });

  describe('getRepoStorageRoot', () => {
    it('URLから正しいストレージパスを生成し、ディレクトリが存在しない場合は作成すること', () => {
      vi.mocked(execSync).mockReturnValue(`origin	ssh://git@github.com:nqounet/deba.git (fetch)
` as any);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const root = getRepoStorageRoot();

      expect(root).toBe(path.join('/home/user', '.deba', 'repos', 'github.com/nqounet/deba'));
      expect(fs.mkdirSync).toHaveBeenCalledWith(root, { recursive: true });
    });

    it('https URL の場合', () => {
      vi.mocked(execSync).mockReturnValue(`origin	https://github.com/nqounet/deba.git (fetch)
` as any);
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const root = getRepoStorageRoot();
      expect(root).toBe(path.join('/home/user', '.deba', 'repos', 'github.com/nqounet/deba'));
    });
  });

  describe('getMainRepoRoot', () => {
    it('メインリポジトリの場合、toplevel を返すこと', () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('--show-toplevel')) return '/path/to/repo' as any;
        if (cmd.includes('--git-common-dir')) return '.git' as any;
        return '' as any;
      });

      const root = getMainRepoRoot();
      expect(root).toBe('/path/to/repo');
    });

    it('Worktree の場合、親リポジトリのルートを特定できること', () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('--show-toplevel')) return '/path/to/main/worktrees/task1' as any;
        if (cmd.includes('--git-common-dir')) return '/path/to/main/.git/worktrees/task1' as any;
        return '' as any;
      });

      const root = getMainRepoRoot();
      expect(root).toBe('/path/to/main');
    });

    it('Git 管理下でない場合、cwd を返すこと', () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error(); });
      const root = getMainRepoRoot();
      expect(root).toBe(process.cwd());
    });
  });

  describe('getWorktreesToClean', () => {
    it('porcelain 出力から deba-wt- を含むパスを抽出できること', () => {
      const output = `worktree /path/to/main
HEAD 12345

worktree /path/to/storage/worktrees/deba-wt-task1
HEAD 67890
branch refs/heads/feature/task1
`;
      
      const list = getWorktreesToClean(output);
      expect(list).toEqual(['/path/to/storage/worktrees/deba-wt-task1']);
    });
  });

  describe('createWorktree', () => {
    it('worktreeディレクトリを作成し、gitコマンドを呼び出すこと', () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('remote -v')) return 'origin	ssh://git@github.com/nqounet/deba.git (fetch)\n' as any;
        if (cmd.includes('--show-toplevel')) return '/path/to/main' as any;
        if (cmd.includes('--git-common-dir')) return '.git' as any;
        return '' as any;
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.lstatSync).mockReturnValue({ isDirectory: () => true } as any);

      const wtPath = createWorktree('task1');

      expect(wtPath).toContain('deba-wt-task1');
      expect(execSync).toHaveBeenCalledWith(expect.stringContaining('git worktree add -b feature/task1'), expect.objectContaining({ stdio: 'inherit' }));
      expect(fs.symlinkSync).toHaveBeenCalled(); 
    });

    it('エラーが発生した場合、例外を投げること', () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('git error'); });
      expect(() => createWorktree('task1')).toThrow(/Failed to create git worktree/);
    });
  });

  describe('removeWorktree', () => {
    it('git worktree remove を呼び出すこと', () => {
      vi.mocked(execSync).mockReturnValue('' as any);
      removeWorktree('/path/to/wt', 'task1');
      expect(execSync).toHaveBeenCalledWith(expect.stringContaining('git worktree remove'), expect.any(Object));
      expect(execSync).toHaveBeenCalledWith(expect.stringContaining('git branch -D feature/task1'), expect.any(Object));
    });
  });

  describe('mergeWorktree', () => {
    it('worktree 側でコミットし、メイン側で merge --squash すること', () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('remote -v')) return 'origin	ssh://git@github.com/nqounet/deba.git (fetch)\n' as any;
        return '' as any;
      });
      mergeWorktree('task1');
      expect(execSync).toHaveBeenCalledWith('git add .', expect.objectContaining({ cwd: expect.any(String) }));
      expect(execSync).toHaveBeenCalledWith(expect.stringContaining('git merge --squash'), expect.any(Object));
    });
  });

  describe('cleanWorktrees', () => {
    it('deba-wt- を含む全ての worktree を削除すること', () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('list --porcelain')) {
          return 'worktree /path/to/deba-wt-task1\n' as any;
        }
        return '' as any;
      });

      cleanWorktrees();

      expect(execSync).toHaveBeenCalledWith(expect.stringContaining('git worktree remove /path/to/deba-wt-task1'), expect.any(Object));
    });

    it('削除対象がない場合は何もしないこと', () => {
      vi.mocked(execSync).mockReturnValue('worktree /main/repo\n' as any);
      const spy = vi.spyOn(console, 'log');
      
      cleanWorktrees();
      
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('No deba-wt worktrees to clean'));
    });
  });
});
