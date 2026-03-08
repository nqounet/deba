import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * ディレクトリを確実に作成し、ファイルを書き込む。
 * オプションで Git リポジトリ内であれば git add を実行する。
 */
export async function applyFileChange(baseDir: string, filePath: string, content: string): Promise<void> {
  const absPath = path.resolve(baseDir, filePath);
  
  // ディレクトリが存在しない場合は作成
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf-8');
  console.log(`✅ Applied changes to: ${filePath} (in ${baseDir})`);

  // Git リポジトリ内であれば git add を実行する
  try {
    execSync(`git add ${filePath}`, { cwd: baseDir });
  } catch {
    // Git 管理下でない場合、または git が利用できない場合は無視
  }
}
