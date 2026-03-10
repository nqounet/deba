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

/**
 * 外部のLLMにエラーメッセージを送信する前に、環境変数や絶対パスなどの機密情報をスクラビング（マスク）する。
 *
 * @param errorMessage スクラビング対象のエラーメッセージ
 * @param projectRoot マスク処理の基準となるプロジェクトルートパス (デフォルト: process.cwd())
 * @returns スクラビングされた安全なエラーメッセージ
 */
export function scrubErrorMessage(errorMessage: string, projectRoot: string = process.cwd()): string {
  if (!errorMessage) return '';
  let scrubbed = errorMessage;

  // 1. プロジェクトルートの絶対パスを秘匿化
  const rootRegex = new RegExp(projectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  scrubbed = scrubbed.replace(rootRegex, '<PROJECT_ROOT>');

  // 2. ホームディレクトリの絶対パスを秘匿化
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    const homeRegex = new RegExp(homeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    scrubbed = scrubbed.replace(homeRegex, '<HOME>');
  }

  // 3. よくある機密情報のパターン（APIキー、トークンなど）の簡易マスク（必要に応じて拡張）
  // 便宜上、sk-[A-Za-z0-9]{20,} や xoxb-[A-Za-z0-9\-]+ などを伏せる
  scrubbed = scrubbed.replace(/sk-[A-Za-z0-9]{20,}/g, 'sk-***');
  scrubbed = scrubbed.replace(/xox[bap]-[A-Za-z0-9\-]{10,}/g, 'xox?-***');
  scrubbed = scrubbed.replace(/(gh[pousr]_[A-Za-z0-9]{36,})/g, 'gh_***');

  return scrubbed;
}
