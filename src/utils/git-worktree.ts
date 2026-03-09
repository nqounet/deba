import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getRepoStorageRoot, getMainRepoRoot } from './git-base.js';

/**
 * taskId の形式を検証し、サニタイズする（英数字、アンダースコア、ハイフンのみ許可）
 */
function validateTaskId(taskId: string): void {
  if (!/^[a-z0-9_\-]+$/i.test(taskId)) {
    throw new Error(`Invalid taskId format: ${taskId}`);
  }
}

/**
 * 指定した taskId に基づく Worktree の期待されるパスを返す
 */
export function getWorktreePath(taskId: string): string {
  validateTaskId(taskId);
  const storageRoot = getRepoStorageRoot();
  return path.resolve(storageRoot, 'worktrees', `deba-wt-${taskId}`);
}

/**
 * .env や mise.toml などの非管理ファイルをメインから Worktree へ同期する
 */
function syncEnvironmentFiles(srcDir: string, destDir: string): void {
  const filesToSync = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.test',
    'mise.toml',
    '.tool-versions',
    'package-lock.json', // 依存関係の整合性のため
  ];

  for (const file of filesToSync) {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);

    if (fs.existsSync(srcPath)) {
      try {
        if (fs.lstatSync(srcPath).isDirectory()) {
          continue;
        }
        fs.copyFileSync(srcPath, destPath);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️ Failed to sync ${file}: ${message}`);
      }
    }
  }
}

/**
 * 指定した taskId に基づいて一時的な Git Worktree を作成または再利用する
 */
export function createWorktree(taskId: string): string {
  try {
    const worktreeDir = getWorktreePath(taskId);
    const branchName = `feature/${taskId}`;

    console.log(`\n--- Git Worktree for isolation ---`);
    console.log(`Directory: ${worktreeDir}`);
    console.log(`Branch: ${branchName}`);

    const worktreesBase = path.dirname(worktreeDir);
    if (!fs.existsSync(worktreesBase)) {
      fs.mkdirSync(worktreesBase, { recursive: true });
    }

    let reuseExisting = false;
    try {
      const porcelain = execSync('git worktree list --porcelain', { encoding: 'utf8' });
      const worktrees = porcelain.split('\n\n');
      for (const wtInfo of worktrees) {
        if (wtInfo.includes(`worktree ${worktreeDir}`) && wtInfo.includes(`branch refs/heads/${branchName}`)) {
          reuseExisting = true;
          break;
        }
      }
    } catch {}

    if (reuseExisting) {
      console.log(`✅ Reusing existing worktree at ${worktreeDir}`);
    } else {
      try { execSync(`git worktree remove ${worktreeDir} --force`, { stdio: 'ignore' }); } catch {}
      try { execSync(`git branch -D ${branchName}`, { stdio: 'ignore' }); } catch {}

      console.log(`Creating new worktree...`);
      execSync(`git worktree add -b ${branchName} ${worktreeDir}`, { stdio: 'inherit' });
    }

    const mainRoot = getMainRepoRoot();
    const mainNodeModules = path.join(mainRoot, 'node_modules');
    const wtNodeModules = path.join(worktreeDir, 'node_modules');
    
    if (fs.existsSync(mainNodeModules)) {
      if (!fs.existsSync(wtNodeModules)) {
        console.log(`Linking node_modules from ${mainNodeModules} to ${wtNodeModules}`);
        if (fs.existsSync(wtNodeModules) && fs.lstatSync(wtNodeModules).isDirectory()) {
          fs.rmSync(wtNodeModules, { recursive: true, force: true });
        }
        fs.symlinkSync(mainNodeModules, wtNodeModules, 'dir');
      }
    }

    syncEnvironmentFiles(mainRoot, worktreeDir);

    return worktreeDir;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create or reuse git worktree: ${message}`);
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
    const taskIdMatch = wt.match(/deba-wt-(task_\d+_\d+_[a-f0-9]+)/);
    if (taskIdMatch && taskIdMatch[1]) {
      const taskId = taskIdMatch[1];
      removeWorktree(wt, taskId);
    } else {
      console.warn(`⚠️ Could not extract a valid taskId from worktree path: ${wt}. Skipping cleanup.`);
    }
  }
}

/**
 * 指定した taskId のブランチを現在のブランチにマージ（squash）する。
 * 正道に基づき、Worktree 側でコミットしてからメインにマージする。
 */
export function mergeWorktree(taskId: string): void {
  try {
    const branchName = `feature/${taskId}`;
    const worktreeDir = getWorktreePath(taskId);

    console.log(`\n--- Merging changes from Worktree (${taskId}) via Git ---`);
    
    try {
      console.log(`Committing changes in worktree: ${worktreeDir}`);
      execSync(`git add .`, { cwd: worktreeDir });
      execSync(`git commit -m "Deba task execution: ${taskId}"`, { cwd: worktreeDir, stdio: 'ignore' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.debug(`[Git] Commit skipped or failed in worktree (possibly no changes): ${message}`);
    }

    execSync(`git merge --squash ${branchName}`, { stdio: 'inherit' });
    console.log(`✅ Git merge --squash completed.`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to merge changes via Git: ${message}`);
  }
}

/**
 * 指定したパスの Git Worktree を削除する
 */
export function removeWorktree(worktreeDir: string, taskId: string): void {
  const branchName = `feature/${taskId}`;
  console.log(`\n--- Removing Git Worktree ---`);

  try {
    execSync(`git worktree remove ${worktreeDir} --force`, { stdio: 'pipe' });
  } catch (error: any) {
    const stderr = error.stderr?.toString() || '';
    const knownErrors = ['is not a working tree', 'not a git repository', 'does not exist'];
    if (!knownErrors.some(e => stderr.includes(e))) {
      console.warn(`⚠️ Failed to remove worktree: ${stderr.trim() || error.message}`);
    }
  }

  try {
    execSync(`git branch -D ${branchName}`, { stdio: 'pipe' });
  } catch (error: any) {
    const stderr = error.stderr?.toString() || '';
    const knownErrors = ['not found'];
    if (!knownErrors.some(e => stderr.includes(e))) {
      console.warn(`⚠️ Failed to remove branch: ${stderr.trim() || error.message}`);
    }
  }

  console.log(`✅ Worktree and branch ${branchName} removed.`);
}
