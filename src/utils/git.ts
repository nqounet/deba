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
    // --path-format=absolute が使えない古い git の可能性も考慮し、
    // まず普通に取得してパスを解決する
    const commonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim();
    const absCommonDir = path.resolve(process.cwd(), commonDir);
    
    // .git ディレクトリ（または .git ファイルが指す実体）の親がリポジトリのルート
    return path.dirname(absCommonDir);
  } catch (error) {
    // Git リポジトリでない場合は現在のディレクトリをルートとする
    return process.cwd();
  }
}
