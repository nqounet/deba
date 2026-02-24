import { execSync } from 'child_process';
import path from 'path';

/**
 * メインリポジトリのルートディレクトリを取得する
 * Worktree 内から実行された場合でも、メインリポジトリのルートを返す
 * Git 管理下でない場合は process.cwd() を返す
 */
export function getMainRepoRoot(): string {
  try {
    // --git-common-dir は、worktree 内でもメインリポジトリの .git ディレクトリを返す
    const commonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim();
    const absCommonDir = path.resolve(process.cwd(), commonDir);
    
    // .git ディレクトリ（または .git ファイルが指す実体）の親がリポジトリのルート
    return path.dirname(absCommonDir);
  } catch (error) {
    // Git リポジトリでない場合は現在のディレクトリをルートとする
    return process.cwd();
  }
}

/**
 * 指定した taskId に基づく Worktree の期待されるパスを返す
 */
export function getWorktreePath(taskId: string): string {
  const mainRoot = getMainRepoRoot();
  return path.resolve(mainRoot, '..', `deba-wt-${taskId}`);
}

/**
 * 指定した taskId に基づいて一時的な Git Worktree を作成する
 */
export function createWorktree(taskId: string): string {
  const worktreeDir = getWorktreePath(taskId);
  const branchName = `feature/${taskId}`;

  console.log(`\n--- Creating Git Worktree for isolation ---`);
  console.log(`Directory: ${worktreeDir}`);
  console.log(`Branch: ${branchName}`);

  try {
    // 既存の worktree や branch があれば削除（念のため）
    try { execSync(`git worktree remove ${worktreeDir} --force`, { stdio: 'ignore' }); } catch {}
    try { execSync(`git branch -D ${branchName}`, { stdio: 'ignore' }); } catch {}

    execSync(`git worktree add -b ${branchName} ${worktreeDir}`, { stdio: 'inherit' });
    return worktreeDir;
  } catch (error: any) {
    throw new Error(`Failed to create git worktree: ${error.message}`);
  }
}

/**
 * 指定した taskId のブランチを現在のブランチにマージ（squash）する
 */
export function mergeWorktree(taskId: string): void {
  const branchName = `feature/${taskId}`;
  console.log(`\n--- Merging changes from ${branchName} (Squash) ---`);
  try {
    execSync(`git merge --squash ${branchName}`, { stdio: 'inherit' });
    console.log(`✅ Changes merged. Please commit if you're satisfied.`);
  } catch (error: any) {
    throw new Error(`Failed to merge changes: ${error.message}`);
  }
}

/**
 * 指定したパスの Git Worktree を削除する
 */
export function removeWorktree(worktreeDir: string, taskId: string): void {
  const branchName = `feature/${taskId}`;
  console.log(`\n--- Removing Git Worktree ---`);
  try {
    execSync(`git worktree remove ${worktreeDir} --force`, { stdio: 'inherit' });
    execSync(`git branch -D ${branchName}`, { stdio: 'inherit' });
    console.log(`✅ Worktree and branch ${branchName} removed.`);
  } catch (error: any) {
    console.warn(`⚠️ Failed to remove worktree or branch: ${error.message}`);
  }
}
