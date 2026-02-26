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
  getWorktreesToClean 
} from '../src/utils/git';

vi.mock('child_process');
vi.mock('fs');
vi.mock('os');

describe('git utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      vi.mocked(os.homedir).mockReturnValue('/home/user');
      // getRemoteOriginUrl の内部で呼ばれる execSync をモック
      vi.mocked(execSync).mockReturnValue(`origin	ssh://git@github.com:nqounet/deba.git (fetch)
` as any);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const root = getRepoStorageRoot();

      // ssh://git@github.com:nqounet/deba.git 
      // -> github.com/nqounet/deba
      expect(root).toBe(path.join('/home/user', '.deba', 'repos', 'github.com/nqounet/deba'));
      expect(fs.mkdirSync).toHaveBeenCalledWith(root, { recursive: true });
    });

    it('https URL の場合', () => {
      vi.mocked(os.homedir).mockReturnValue('/home/user');
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
        // common-dir は worktree の場合、メインリポジトリの .git フォルダ内を指す
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
});
