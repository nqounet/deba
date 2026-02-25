import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * Git の remote origin (fetch) の URL を取得する
 */
export function getRemoteOriginUrl(): string {
  try {
    const output = execSync('git remote -v', { encoding: 'utf8' });
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.startsWith('origin') && line.includes('(fetch)')) {
        const match = line.match(/origin\s+(.+)\s+\(fetch\)/);
        if (match) return match[1];
      }
    }
    throw new Error('origin remote not found');
  } catch (error: any) {
    throw new Error(`Git origin remote is required to determine storage path. (Error: ${error.message})`);
  }
}

/**
 * リポジトリの URL から、グローバルなストレージパスを算出する
 * 例: ssh://git@github.com/nqounet/deba.git -> ~/.deba/repos/github.com/nqounet/deba/
 */
export function getRepoStorageRoot(): string {
  const url = getRemoteOriginUrl();
  
  // 1. プロトコル、ユーザー名、末尾の .git を削除し、: を / に変換
  const cleanPath = url
    .replace(/^.*:\/\//, '')      // ssh://, https:// 等を削除
    .replace(/^.*@/, '')          // git@ 等を削除
    .replace(/\.git$/, '')         // 末尾の .git を削除
    .replace(/:/g, '/');           // : を / に変換 (github.com:user/repo 対応)

  const storageRoot = path.join(os.homedir(), '.deba', 'repos', cleanPath);
  
  // ディレクトリが存在しない場合は作成
  if (!fs.existsSync(storageRoot)) {
    fs.mkdirSync(storageRoot, { recursive: true });
  }
  
  return storageRoot;
}

/**
 * メインリポジトリのルートディレクトリ（本営）を確実に取得する。
 * Worktree 内から実行された場合でも、Worktree ではない「メインのワーキングツリー」のルートを返す。
 * Git 管理下でない場合は process.cwd() を返す。
 */
export function getMainRepoRoot(): string {
  try {
    // 1. まず現在のワーキングツリーのルートを取得
    const currentToplevel = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    
    // 2. メインリポジトリの共通 .git ディレクトリを取得
    // Worktree の場合、これはメインリポジトリ内の .git ディレクトリを指す
    const commonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim();
    const absCommonDir = path.resolve(currentToplevel, commonDir);
    
    // 3. commonDir が ".git" で終わっている場合、その親がメインリポジトリのルート
    // (通常、メインリポジトリでは commonDir は ".git" または絶対パスになる)
    if (absCommonDir.endsWith('.git')) {
      return path.dirname(absCommonDir);
    }
    
    // Worktree の場合、commonDir はメインリポジトリの .git フォルダ内を指す
    // 例: /path/to/main/.git/worktrees/task_xxx
    // この場合は、".git" という名前のディレクトリが見つかるまで親に遡る
    let current = absCommonDir;
    while (current !== path.dirname(current)) {
      if (path.basename(current) === '.git') {
        return path.dirname(current);
      }
      current = path.dirname(current);
    }

    return currentToplevel;
  } catch (error) {
    return process.cwd();
  }
}

/**
 * 指定した taskId に基づく Worktree の期待されるパスを返す
 */
export function getWorktreePath(taskId: string): string {
  const storageRoot = getRepoStorageRoot();
  return path.resolve(storageRoot, 'worktrees', `deba-wt-${taskId}`);
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
    // .worktrees ディレクトリを確実に作成
    const worktreesBase = path.dirname(worktreeDir);
    if (!fs.existsSync(worktreesBase)) {
      fs.mkdirSync(worktreesBase, { recursive: true });
    }

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
 * git worktree list --porcelain の出力をパースし、
 * deba-wt- で始まる一時的な worktree のリストを返す。
 */
export function getWorktreesToClean(porcelainOutput: string): string[] {
  const lines = porcelainOutput.split('\n');
  const worktrees: string[] = [];
  for (const line of lines) {
    if (line.startsWith('worktree ') && line.includes('deba-wt-')) {
      worktrees.push(line.replace('worktree ', '').trim());
    }
  }
  return worktrees;
}

/**
 * deba-wt- で始まる一時的な worktree をすべて削除する。
 */
export function cleanWorktrees(): void {
  const porcelain = execSync('git worktree list --porcelain', { encoding: 'utf8' });
  const worktrees = getWorktreesToClean(porcelain);
  
  if (worktrees.length === 0) {
    console.log('✅ No deba-wt worktrees to clean.');
    return;
  }

  for (const wt of worktrees) {
    // パスから taskId を抽出を試みる (deba-wt-task_20260225_001)
    const taskIdMatch = wt.match(/deba-wt-(task_\d+_\d+)/);
    const taskId = taskIdMatch ? taskIdMatch[1] : '';
    removeWorktree(wt, taskId);
  }
}

/**
 * 指定した taskId のブランチを現在のブランチにマージ（squash）する。
 * 正道に基づき、Worktree 側でコミットしてからメインにマージする。
 */
export function mergeWorktree(taskId: string): void {
  const branchName = `feature/${taskId}`;
  const worktreeDir = getWorktreePath(taskId);

  console.log(`\n--- Merging changes from Worktree (${taskId}) via Git ---`);
  
  try {
    // 1. Worktree 側で未コミットの変更があればコミットする
    try {
      console.log(`Committing changes in worktree: ${worktreeDir}`);
      execSync(`git add .`, { cwd: worktreeDir });
      execSync(`git commit -m "Deba task execution: ${taskId}"`, { cwd: worktreeDir, stdio: 'ignore' });
    } catch {
      // 変更がない場合はコミットが失敗するが、そのまま進む
    }

    // 2. メインリポジトリ側で squash merge を実行
    // (getMainRepoRoot() で実行されることを想定)
    execSync(`git merge --squash ${branchName}`, { stdio: 'inherit' });
    
    console.log(`✅ Git merge --squash completed.`);
  } catch (error: any) {
    throw new Error(`Failed to merge changes via Git: ${error.message}`);
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
