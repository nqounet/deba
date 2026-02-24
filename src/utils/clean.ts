import * as fs from 'fs/promises';
import * as path from 'path';
import { getMainRepoRoot } from './git.js';

/**
 * スナップショットディレクトリのリストを受け取り、指定した日数より古いディレクトリ名を返す。
 * @param dirs ディレクトリ名と更新日時のリスト
 * @param days 古いとみなす日数
 */
export function getSnapshotsToClean(dirs: { name: string, mtime: number }[], days: number): string[] {
  const now = Date.now();
  const threshold = days * 24 * 60 * 60 * 1000;
  
  return dirs
    .filter(dir => (now - dir.mtime) >= threshold)
    .map(dir => dir.name);
}

/**
 * 古いスナップショットを削除する。
 * @param days 保持する日数
 */
export async function cleanSnapshots(days: number = 7): Promise<void> {
  const snapshotsRoot = path.join(getMainRepoRoot(), 'snapshots');
  try {
    const entries = await fs.readdir(snapshotsRoot, { withFileTypes: true });
    const dirInfos = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const stats = await fs.stat(path.join(snapshotsRoot, entry.name));
        dirInfos.push({ name: entry.name, mtime: stats.mtimeMs });
      }
    }
    
    const toClean = getSnapshotsToClean(dirInfos, days);
    
    if (toClean.length === 0) {
      console.log('✅ No old snapshots to clean.');
      return;
    }

    for (const dirName of toClean) {
      await fs.rm(path.join(snapshotsRoot, dirName), { recursive: true, force: true });
      console.log(`🗑️ Removed old snapshot: ${dirName}`);
    }
  } catch (error) {
    // ディレクトリがない場合などは無視
  }
}
