import { vi, describe, it, expect, beforeEach, beforeAll } from 'vitest';
import ora from 'ora'; // oraの型情報のため

// oraモジュール全体をモック
vi.mock('ora', () => {
  const mockOraInstance = {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    text: '', // textプロパティのモック
    color: 'white', // colorプロパティのモック
  };
  const ora = vi.fn(() => mockOraInstance);
  return {
    default: ora,
  };
});

describe('Spinner', () => {
  // src/utils/spinnerからエクスポートされたシンボルを保持するための変数
  let spinnerInstance: typeof import('../../src/utils/spinner').default;
  let SpinnerClass: typeof import('../../src/utils/spinner').Spinner;
  let mockOraInstance: any;

  beforeAll(async () => {
    // vi.mock('ora')が完全に設定された後に、テスト対象のモジュールを動的にインポートする
    // これにより、oraのモックが確実に適用され、'already declared'エラーを回避する
    const module = await import('../../src/utils/spinner');
    spinnerInstance = module.default;
    SpinnerClass = module.Spinner;

    // mockOraInstanceはoraモックのファクトリから取得する
    // oraモックはvi.mockのクロージャ内で定義されたmockOraInstanceを常に返すため、
    // ここでora()を呼び出すことでそのインスタンスを取得できる
    mockOraInstance = (ora as unknown as ReturnType<typeof vi.fn>)();
  });

  beforeEach(() => {
    // 各テストの前にモックの状態をリセット
    vi.clearAllMocks();
    // mockOraInstanceのメソッドもクリアする
    // (ora as unknown as ReturnType<typeof vi.fn>)(); を再度呼び出して新しいモックインスタンスを取得する必要はない
    // なぜなら、vi.mockのファクトリ関数は一度だけ実行され、常に同じmockOraInstanceを返すように設定されているため。
    // その代わり、beforeAllで取得したmockOraInstanceのメソッドをクリアする
    mockOraInstance.start.mockClear();
    mockOraInstance.succeed.mockClear();
    mockOraInstance.fail.mockClear();
    mockOraInstance.stop.mockClear();
    mockOraInstance.info.mockClear();
    mockOraInstance.warn.mockClear();
    mockOraInstance.text = ''; // textプロパティをリセット
    mockOraInstance.color = 'white'; // colorプロパティをリセット
  });

  it('should initialize ora with provided options', () => {
    const testOptions = 'Loading...';
    // 新しいSpinnerインスタンスを作成してoraが呼ばれることを確認
    new SpinnerClass(testOptions); // SpinnerClassを使用
    expect(ora).toHaveBeenCalledWith(testOptions);
  });

  it('start should call oraInstance.start and return this', () => {
    const text = 'Starting...';
    const result = spinnerInstance.start(text); // spinnerInstanceを使用
    expect(mockOraInstance.start).toHaveBeenCalledWith(text);
    expect(result).toBe(spinnerInstance); // メソッドチェーンの検証
  });

  it('succeed should call oraInstance.succeed and return this', () => {
    const text = 'Success!';
    const result = spinnerInstance.succeed(text);
    expect(mockOraInstance.succeed).toHaveBeenCalledWith(text);
    expect(result).toBe(spinnerInstance);
  });

  it('fail should call oraInstance.fail and return this', () => {
    const text = 'Failed!';
    const result = spinnerInstance.fail(text);
    expect(mockOraInstance.fail).toHaveBeenCalledWith(text);
    expect(result).toBe(spinnerInstance);
  });

  it('stop should call oraInstance.stop and return this', () => {
    const result = spinnerInstance.stop();
    expect(mockOraInstance.stop).toHaveBeenCalledWith();
    expect(result).toBe(spinnerInstance);
  });

  it('info should call oraInstance.info and return this', () => {
    const text = 'Information.';
    const result = spinnerInstance.info(text);
    expect(mockOraInstance.info).toHaveBeenCalledWith(text);
    expect(result).toBe(spinnerInstance);
  });

  it('warn should call oraInstance.warn and return this', () => {
    const text = 'Warning!';
    const result = spinnerInstance.warn(text);
    expect(mockOraInstance.warn).toHaveBeenCalledWith(text);
    expect(result).toBe(spinnerInstance);
  });

  it('should set and get text property', () => {
    const newText = 'New spinner text';
    spinnerInstance.text = newText;
    expect(mockOraInstance.text).toBe(newText);
    expect(spinnerInstance.text).toBe(newText);
  });

  it('should set and get color property', () => {
    const newColor: Ora['color'] = 'yellow'; // ora.Color の代わりに Ora['color'] を使用
    spinnerInstance.color = newColor;
    expect(mockOraInstance.color).toBe(newColor);
    expect(spinnerInstance.color).toBe(newColor);
  });
});