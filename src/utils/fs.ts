import * as fs from 'fs/promises';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { validateFilePaths } from './sanitize.js';

/**
 * ディレクトリを確実に作成し、ファイルを書き込む。
 * オプションで Git リポジトリ内であれば git add を実行する。
 */
export async function applyFileChange(baseDir: string, filePath: string, content: string): Promise<void> {
  const validPaths = validateFilePaths([filePath], baseDir);
  if (validPaths.length === 0) {
    throw new Error(`File path is outside of the base directory: ${filePath}`);
  }

  const absPath = path.resolve(baseDir, filePath);
  const dirName = path.dirname(absPath);
  
  // ディレクトリが存在しない場合は作成
  await fs.mkdir(dirName, { recursive: true });

  // アトミックな書き込みのために一時ファイルを使用
  const tmpPath = `${absPath}.tmp.${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(tmpPath, content, 'utf-8');
  await fs.rename(tmpPath, absPath);

  console.log(`✅ Applied changes to: ${filePath} (in ${baseDir})`);

  // Git リポジトリ内であれば git add を実行する
  try {
    execFileSync('git', ['add', filePath], { cwd: baseDir });
  } catch {
    // Git 管理下でない場合、または git が利用できない場合は無視
  }
}
