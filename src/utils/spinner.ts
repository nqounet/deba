import ora, { Ora } from 'ora';

/**
 * アプリケーション全体で共有される ora スピナーのラッパーモジュール。
 * シングルトンパターンで実装され、一貫したスピナーの動作を提供します。
 */
class SpinnerService {
<<<<<<< HEAD
  private _spinner: Ora;
=======
  private spinner: Ora;
>>>>>>> feature/task_20260227_235545_d8dc4aca
  private static instance: SpinnerService;

  /**
   * シングルトンインスタンスのコンストラクタ。
   * ora インスタンスを一度だけ作成します。
   */
  private constructor() {
    // 初期スピナーインスタンスを作成。テキストは空でも問題ありません。
    // stream を process.stdout に明示的に設定することで、標準出力への描画を保証します。
<<<<<<< HEAD
    this._spinner = ora({ text: '', stream: process.stdout });
=======
    this.spinner = ora({ text: '', stream: process.stdout });
>>>>>>> feature/task_20260227_235545_d8dc4aca
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
<<<<<<< HEAD
    this._spinner.text = text;
    if (!this._spinner.isSpinning) {
      this._spinner.start();
    }
    return this._spinner;
=======
    this.spinner.text = text;
    if (!this.spinner.isSpinning) {
      this.spinner.start();
    }
    return this.spinner;
>>>>>>> feature/task_20260227_235545_d8dc4aca
  }

  /**
   * スピナーを成功状態にして停止し、指定されたテキスト（オプション）を表示します。
   * @param text 成功時に表示するテキスト（オプション）
   * @returns ora インスタンス
   */
  public succeed(text?: string): Ora {
<<<<<<< HEAD
    if (this._spinner.isSpinning) {
      this._spinner.succeed(text);
    }
    return this._spinner;
=======
    if (this.spinner.isSpinning) {
      this.spinner.succeed(text);
    }
    return this.spinner;
>>>>>>> feature/task_20260227_235545_d8dc4aca
  }

  /**
   * スピナーを失敗状態にして停止し、指定されたテキスト（オプション）を表示します。
   * @param text 失敗時に表示するテキスト（オプション）
   * @returns ora インスタンス
   */
  public fail(text?: string): Ora {
<<<<<<< HEAD
    if (this._spinner.isSpinning) {
      this._spinner.fail(text);
    }
    return this._spinner;
=======
    if (this.spinner.isSpinning) {
      this.spinner.fail(text);
    }
    return this.spinner;
>>>>>>> feature/task_20260227_235545_d8dc4aca
  }

  /**
   * スピナーのテキストを更新します。
   * スピナーがアクティブでなくてもテキストは設定されますが、表示はされません。
   * @param text 更新するテキスト
   * @returns ora インスタンス
   */
  public setText(text: string): Ora {
<<<<<<< HEAD
    this._spinner.text = text;
    return this._spinner;
=======
    this.spinner.text = text;
    return this.spinner;
>>>>>>> feature/task_20260227_235545_d8dc4aca
  }

  /**
   * スピナーを停止します。成功、失敗などの記号は表示されません。
   * @returns ora インスタンス
   */
  public stop(): Ora {
<<<<<<< HEAD
    if (this._spinner.isSpinning) {
      this._spinner.stop();
    }
    return this._spinner;
=======
    if (this.spinner.isSpinning) {
      this.spinner.stop();
    }
    return this.spinner;
>>>>>>> feature/task_20260227_235545_d8dc4aca
  }

  /**
   * 情報メッセージを表示します（スピナーがアクティブな場合）。
   * @param text 情報メッセージ
   * @returns ora インスタンス
   */
  public info(text: string): Ora {
<<<<<<< HEAD
    if (this._spinner.isSpinning) {
      this._spinner.info(text);
    }
    return this._spinner;
=======
    if (this.spinner.isSpinning) {
      this.spinner.info(text);
    }
    return this.spinner;
>>>>>>> feature/task_20260227_235545_d8dc4aca
  }

  /**
   * 警告メッセージを表示します（スピナーがアクティブな場合）。
   * @param text 警告メッセージ
   * @returns ora インスタンス
   */
  public warn(text: string): Ora {
<<<<<<< HEAD
    if (this._spinner.isSpinning) {
      this._spinner.warn(text);
    }
    return this._spinner;
=======
    if (this.spinner.isSpinning) {
      this.spinner.warn(text);
    }
    return this.spinner;
>>>>>>> feature/task_20260227_235545_d8dc4aca
  }

  /**
   * スピナーを停止し、最終的なテキストとオプションのシンボルを永続的に表示します。
   * @param options symbol (表示するシンボル) と text (表示するテキスト) を含むオブジェクト
   * @returns ora インスタンス
   */
  public stopAndPersist(options?: { symbol?: string; text?: string }): Ora {
<<<<<<< HEAD
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
=======
    if (this.spinner.isSpinning) {
      this.spinner.stopAndPersist(options);
    }
    return this.spinner;
>>>>>>> feature/task_20260227_235545_d8dc4aca
  }
}

/**
 * アプリケーション全体で使用するスピナーインスタンス。
 * これをインポートしてスピナー操作を行います。
 * 例: import { spinner } from '../utils/spinner'; spinner.start('Loading...');
 */
<<<<<<< HEAD
export const spinner = SpinnerService.getInstance();
=======
export const spinner = SpinnerService.getInstance();
>>>>>>> feature/task_20260227_235545_d8dc4aca
