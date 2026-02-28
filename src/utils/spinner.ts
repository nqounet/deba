import ora, { Ora } from 'ora';

/**
 * アプリケーション全体で共有される ora スピナーのラッパーモジュール。
 * シングルトンパターンで実装され、一貫したスピナーの動作を提供します。
 */
class SpinnerService {
  private _spinner: Ora;
  private static instance: SpinnerService;

  /**
   * シングルトンインスタンスのコンストラクタ。
   * ora インスタンスを一度だけ作成します。
   */
  private constructor() {
    // 初期スピナーインスタンスを作成。テキストは空でも問題ありません。
    // stream を process.stdout に明示的に設定することで、標準出力への描画を保証します。
    this._spinner = ora({ text: '', stream: process.stdout });
  }

  /**
   * SpinnerService のシングルトンインスタンスを取得します。
   * @returns SpinnerService のインスタンス
   */
  public static getInstance(): SpinnerService {
    if (!SpinnerService.instance) {
      SpinnerService.instance = new SpinnerService();
    }
    return SpinnerService.instance;
  }

  /**
   * スピナーを開始し、指定されたテキストを表示します。
   * スピナーが既に稼働中の場合、テキストのみを更新します。
   * @param text スピナーに表示するテキスト
   * @returns ora インスタンス
   */
  public start(text: string): Ora {
    this._spinner.text = text;
    if (!this._spinner.isSpinning) {
      this._spinner.start();
    }
    return this._spinner;
  }

  /**
   * スピナーを成功状態にして停止し、指定されたテキスト（オプション）を表示します。
   * @param text 成功時に表示するテキスト（オプション）
   * @returns ora インスタンス
   */
  public succeed(text?: string): Ora {
    if (this._spinner.isSpinning) {
      this._spinner.succeed(text);
    }
    return this._spinner;
  }

  /**
   * スピナーを失敗状態にして停止し、指定されたテキスト（オプション）を表示します。
   * @param text 失敗時に表示するテキスト（オプション）
   * @returns ora インスタンス
   */
  public fail(text?: string): Ora {
    if (this._spinner.isSpinning) {
      this._spinner.fail(text);
    }
    return this._spinner;
  }

  /**
   * スピナーのテキストを更新します。
   * スピナーがアクティブでなくてもテキストは設定されますが、表示はされません。
   * @param text 更新するテキスト
   * @returns ora インスタンス
   */
  public setText(text: string): Ora {
    this._spinner.text = text;
    return this._spinner;
  }

  /**
   * スピナーを停止します。成功、失敗などの記号は表示されません。
   * @returns ora インスタンス
   */
  public stop(): Ora {
    if (this._spinner.isSpinning) {
      this._spinner.stop();
    }
    return this._spinner;
  }

  /**
   * 情報メッセージを表示します（スピナーがアクティブな場合）。
   * @param text 情報メッセージ
   * @returns ora インスタンス
   */
  public info(text: string): Ora {
    if (this._spinner.isSpinning) {
      this._spinner.info(text);
    }
    return this._spinner;
  }

  /**
   * 警告メッセージを表示します（スピナーがアクティブな場合）。
   * @param text 警告メッセージ
   * @returns ora インスタンス
   */
  public warn(text: string): Ora {
    if (this._spinner.isSpinning) {
      this._spinner.warn(text);
    }
    return this._spinner;
  }

  /**
   * スピナーを停止し、最終的なテキストとオプションのシンボルを永続的に表示します。
   * @param options symbol (表示するシンボル) と text (表示するテキスト) を含むオブジェクト
   * @returns ora インスタンス
   */
  public stopAndPersist(options?: { symbol?: string; text?: string }): Ora {
    if (this._spinner.isSpinning) {
      this._spinner.stopAndPersist(options);
    }
    return this._spinner;
  }

  /**
   * スピナーが現在稼働中かどうかを取得します。
   */
  public get isSpinning(): boolean {
    return this._spinner.isSpinning;
  }
}

/**
 * アプリケーション全体で使用するスピナーインスタンス。
 * これをインポートしてスピナー操作を行います。
 * 例: import { spinner } from '../utils/spinner'; spinner.start('Loading...');
 */
export const spinner = SpinnerService.getInstance();
