import * as path from 'path';

/**
 * シェルメタ文字のパターン（コマンドインジェクション防止）
 */
const DANGEROUS_CHARS = /[;|&`$()><\n\r]/;

/**
 * test_command のホワイトリストパターン
 * 許可: npm test, npx vitest, npx jest で始まるコマンドのみ
 */
const ALLOWED_COMMAND_PREFIXES = [
  'npm test',
  'npx vitest',
  'npx jest',
];

/**
 * test_command をサニタイズする。
 * ホワイトリストに含まれないコマンドや危険な文字を含む場合はエラーを投げる。
 *
 * @param command - 検証するテストコマンド文字列
 * @returns サニタイズ済みのコマンド文字列
 * @throws 許可されていないコマンドの場合
 */
export function sanitizeTestCommand(command: string): string {
  const trimmed = command.trim();

  if (!trimmed) {
    throw new Error('test_command が空です。');
  }

  // 危険なシェルメタ文字のチェック
  if (DANGEROUS_CHARS.test(trimmed)) {
    throw new Error(`test_command に危険な文字が含まれています: "${trimmed}"`);
  }

  // ホワイトリストチェック
  const isAllowed = ALLOWED_COMMAND_PREFIXES.some(prefix => trimmed.startsWith(prefix));
  if (!isAllowed) {
    throw new Error(
      `test_command が許可されたパターンに一致しません: "${trimmed}"。` +
      `許可されるプレフィックス: ${ALLOWED_COMMAND_PREFIXES.join(', ')}`
    );
  }

  return trimmed;
}

/**
 * ファイルパスの配列を検証し、パストラバーサルを防止する。
 * プロジェクトルート外のパスは警告ログを出力してフィルタリングする。
 *
 * @param filePaths - 検証するファイルパスの配列
 * @param projectRoot - プロジェクトのルートディレクトリ
 * @returns プロジェクトルート内のパスのみを含む配列
 */
export function validateFilePaths(filePaths: string[], projectRoot: string): string[] {
  const resolvedRoot = path.resolve(projectRoot);
  const validPaths: string[] = [];

  for (const filePath of filePaths) {
    const resolvedPath = path.resolve(projectRoot, filePath);

    // プロジェクトルート配下にあるか確認
    if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
      console.warn(`⚠️ パストラバーサルの可能性があるためスキップしました: ${filePath}`);
      continue;
    }

    validPaths.push(filePath);
  }

  return validPaths;
}
