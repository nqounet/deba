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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Git origin remote is required to determine storage path. (Error: ${message})`);
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

let cachedMainRepoRoot: string | null = null;

/**
 * テスト用にキャッシュをリセットする (内部用)
 */
export function __resetMainRepoRootCache(): void {
  cachedMainRepoRoot = null;
}

/**
 * メインリポジトリのルートディレクトリ（本営）を確実に取得する。
 */
export function getMainRepoRoot(): string {
  if (cachedMainRepoRoot) return cachedMainRepoRoot;

  try {
    // 1. まず現在のワーキングツリーのルートを取得
    const currentToplevel = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    
    // 2. メインリポジトリの共通 .git ディレクトリを取得
    const commonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim();
    const absCommonDir = path.resolve(currentToplevel, commonDir);
    
    if (absCommonDir.endsWith('.git')) {
      cachedMainRepoRoot = path.dirname(absCommonDir);
    } else {
      let current = absCommonDir;
      while (current !== path.dirname(current)) {
        if (path.basename(current) === '.git') {
          cachedMainRepoRoot = path.dirname(current);
          break;
        }
        current = path.dirname(current);
      }
      if (!cachedMainRepoRoot) cachedMainRepoRoot = currentToplevel;
    }

    return cachedMainRepoRoot;
  } catch (error) {
    return process.cwd();
  }
}
