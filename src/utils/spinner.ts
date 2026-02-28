import ora, { Ora, Options } from 'ora';

/**
 * アプリケーション全体で共有される ora スピナーのラッパーモジュール。
 * シングルトンパターンで実装され、一貫したスピナーの動作を提供します。
 */
export class Spinner {
  private _spinner: Ora;
  private static instance: Spinner;

  /**
   * スピナーのコンストラクタ。
   * @param options ora のオプションまたはテキスト
   */
  constructor(options?: string | Options) {
    this._spinner = ora(options || { text: '', stream: process.stdout });
  }

  /**
   * Spinner のシングルトンインスタンスを取得します。
   * @returns Spinner のインスタンス
   */
  public static getInstance(): Spinner {
    if (!Spinner.instance) {
      Spinner.instance = new Spinner();
    }
    return Spinner.instance;
  }

  /**
   * スピナーのテキストを取得または設定します。
   */
  public get text(): string {
    return this._spinner.text;
  }

  public set text(value: string) {
    this._spinner.text = value;
  }

  /**
   * スピナーの色を取得または設定します。
   */
  public get color(): Ora['color'] {
    return this._spinner.color;
  }

  public set color(value: Ora['color']) {
    this._spinner.color = value;
  }

  /**
   * スピナーを開始し、指定されたテキストを表示します。
   * スピナーが既に稼働中の場合、テキストのみを更新します。
   * @param text スピナーに表示するテキスト
   * @returns Spinner インスタンス
   */
  public start(text: string): Spinner {
    this._spinner.start(text);
    return this;
  }

  /**
   * スピナーを成功状態にして停止し、指定されたテキスト（オプション）を表示します。
   * @param text 成功時に表示するテキスト（オプション）
   * @returns Spinner インスタンス
   */
  public succeed(text?: string): Spinner {
    this._spinner.succeed(text);
    return this;
  }

  /**
   * スピナーを失敗状態にして停止し、指定されたテキスト（オプション）を表示します。
   * @param text 失敗時に表示するテキスト（オプション）
   * @returns Spinner インスタンス
   */
  public fail(text?: string): Spinner {
    this._spinner.fail(text);
    return this;
  }

  /**
   * スピナーのテキストを更新します。
   * スピナーがアクティブでなくてもテキストは設定されますが、表示はされません。
   * @param text 更新するテキスト
   * @returns Spinner インスタンス
   */
  public setText(text: string): Spinner {
    this._spinner.text = text;
    return this;
  }

  /**
   * スピナーを停止します。成功、失敗などの記号は表示されません。
   * @returns Spinner インスタンス
   */
  public stop(): Spinner {
    this._spinner.stop();
    return this;
  }

  /**
   * 情報メッセージを表示します（スピナーがアクティブな場合）。
   * @param text 情報メッセージ
   * @returns Spinner インスタンス
   */
  public info(text: string): Spinner {
    this._spinner.info(text);
    return this;
  }

  /**
   * 警告メッセージを表示します（スピナーがアクティブな場合）。
   * @param text 警告メッセージ
   * @returns Spinner インスタンス
   */
  public warn(text: string): Spinner {
    this._spinner.warn(text);
    return this;
  }

  /**
   * スピナーを停止し、最終的なテキストとオプションのシンボルを永続的に表示します。
   * @param options symbol (表示するシンボル) と text (表示するテキスト) を含むオブジェクト
   * @returns Spinner インスタンス
   */
  public stopAndPersist(options?: { symbol?: string; text?: string }): Spinner {
    this._spinner.stopAndPersist(options);
    return this;
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
export const spinner = Spinner.getInstance();
export default spinner;
