import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { getMainRepoRoot } from '../utils/git.js';

/**
 * リポジトリと起点になるブランチを指定して、deba 内部の worktrees ディレクトリに Worktree を作成する。
 * @param repoPath ターゲットリポジトリのパス
 * @param branchName 起点となるブランチ名
 * @param options オプション（作業ツリー名）
 */
export async function worktreeAddCommand(repoPath: string, branchName: string, options: { name?: string }) {
  const debaRoot = getMainRepoRoot();
  const worktreesDir = path.join(debaRoot, 'worktrees');

  try {
    // 1. ターゲットリポジトリの存在確認
    const absoluteRepoPath = path.resolve(repoPath);
    try {
      await fs.access(absoluteRepoPath);
    } catch {
      console.error(`❌ リポジトリパスが見つかりません: ${absoluteRepoPath}`);
      process.exit(1);
    }

    // 2. worktrees ディレクトリの作成
    await fs.mkdir(worktreesDir, { recursive: true });

    // 3. 作業ツリー名の決定（指定がなければブランチ名から生成）
    const worktreeName = options.name || branchName.replace(/[\\\/]/g, '_');
    const targetPath = path.join(worktreesDir, worktreeName);

    console.log(`
--- Creating Git Worktree ---`);
    console.log(`Repo: ${absoluteRepoPath}`);
    console.log(`Branch: ${branchName}`);
    console.log(`Target: ${targetPath}`);

    // 4. git worktree add の実行
    // ターゲットディレクトリを絶対パスで指定し、リポジトリパスをカレントディレクトリとして実行する
    execSync(`git worktree add "${targetPath}" "${branchName}"`, {
      cwd: absoluteRepoPath,
      stdio: 'inherit'
    });

    console.log(`
✅ Worktree が正常に作成されました: ${targetPath}`);
  } catch (error: any) {
    console.error(`
❌ Worktree の作成に失敗しました: ${error.message}`);
    process.exit(1);
  }
}
