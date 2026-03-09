import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getMainRepoRoot } from '../src/utils/git-base';
import { createWorktree, getWorktreePath, removeWorktree } from '../src/utils/git-worktree';

describe('Worktree Reuse and Sync', () => {
  const taskId = 'test_reuse_task_123';
  const worktreeDir = getWorktreePath(taskId);

  beforeEach(() => {
    // 念のためクリーンアップ
    try {
      removeWorktree(worktreeDir, taskId);
    } catch {}
  });

  afterEach(() => {
    try {
      removeWorktree(worktreeDir, taskId);
    } catch {}
  });

  it('should reuse existing worktree and preserve files', () => {
    // 1回目の作成
    const wt1 = createWorktree(taskId);
    expect(wt1).toBe(worktreeDir);
    expect(fs.existsSync(wt1)).toBe(true);

    // ファイルを作成
    const testFile = path.join(wt1, 'persistence_test.txt');
    fs.writeFileSync(testFile, 'hello world', 'utf-8');

    // 2回目の作成（再利用されるはず）
    const wt2 = createWorktree(taskId);
    expect(wt2).toBe(wt1);
    
    // ファイルが残っているか確認
    expect(fs.existsSync(testFile)).toBe(true);
    expect(fs.readFileSync(testFile, 'utf-8')).toBe('hello world');
  });

  it('should sync environment files', () => {
    const mainRoot = getMainRepoRoot();
    const envFile = path.join(mainRoot, '.env.test_sync_mock');
    
    // モックの環境ファイルを作成（メインリポジトリに一時的に作成）
    // 本来は .env などを使うが、既存のファイルを壊さないように別の名前にしたい
    // しかし syncEnvironmentFiles は固定のリストを持っているので、
    // テスト用に mise.toml とかを使うか、一時的に syncEnvironmentFiles のリストに載っているものを使う
    
    const miseToml = path.join(mainRoot, 'mise.toml');
    const hasMise = fs.existsSync(miseToml);
    
    if (!hasMise) {
        fs.writeFileSync(miseToml, '# mock mise', 'utf-8');
    }

    try {
        const wt = createWorktree(taskId);
        const wtMise = path.join(wt, 'mise.toml');
        expect(fs.existsSync(wtMise)).toBe(true);
    } finally {
        if (!hasMise) {
            fs.unlinkSync(miseToml);
        }
    }
  });
});
