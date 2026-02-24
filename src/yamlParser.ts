import yaml from 'yaml';

export interface ParseResult {
  yamlRaw: string;
  parsedObject: any | null;
  error?: string;
}

/**
 * テキストから ```json ... ``` または ```yaml ... ``` ブロックを抽出し、パースする
 */
export function extractAndParseYaml(text: string): ParseResult {
  // 正規表現を /^\s*```(?:json|yaml)?\n?([\s\S]*?)\n?```/im に変更
  // text.matchAll() を検討するか、最初のマッチを確実に取得する。text.match() は最初の一つしか返さないため、これで十分。
  // 注意: この正規表現では閉じ ``` が必須となり、不完全なブロックはマッチしない。
  const blockRegex = /^\s*```(?:json|yaml)?\n?([\s\S]*?)\n?```/im;
  const match = text.match(blockRegex);

  let raw = '';
  let initialError: string | undefined;

  if (match && match[1]) {
    // 返す yamlRaw は抽出した文字列そのものとし、末尾の空白などは必要に応じて trim() してください。
    raw = match[1].trim();
  } else {
    // マークダウンブロックが無い場合、または正規表現がマッチしなかった場合
    const trimmedText = text.trim();
    // match が見つからない場合は text.trim() を使用しますが、その際にもバッククォートが含まれていないかチェックするガードを入れてください。
    if (trimmedText.includes('```')) {
      // バッククォートが含まれているが正規表現にマッチしなかった場合は、不正な形式とみなしてエラーとする
      initialError = 'テキストにコードブロックの開始または終了記号が含まれていますが、有効な形式ではありませんでした。';
      raw = trimmedText; // エラーメッセージに含めるため、rawはセットしておく
    } else {
      // バッククォートが含まれていない場合、全体を構造化データとして試行する
      raw = trimmedText;
    }
  }

  // initialError がある場合は、そのエラー情報を含めて処理を終了する
  if (initialError) {
    return {
      yamlRaw: raw,
      parsedObject: null,
      error: initialError,
    };
  }

  // yamlRaw が空文字列、またはパース結果が undefined/null の場合の戻り値を整理してください。
  if (!raw) {
    return {
      yamlRaw: '',
      parsedObject: null,
    };
  }

  // まず JSON として試行
  try {
    // JSONとしてパース可能な場合、それを返す
    const parsedObject = JSON.parse(raw);
    // 不正なYAMLのテスト: yaml.parseの結果が期待したオブジェクト構造（キーと値のペア）になっているかを簡易検証し、そうでなければエラーを投げるようにしてください。
    if (typeof parsedObject !== 'object' || parsedObject === null || Array.isArray(parsedObject)) {
      throw new Error('JSONパース結果が期待されるオブジェクト構造ではありません。（オブジェクト、nullではない、配列ではない）');
    }
    return {
      yamlRaw: raw,
      parsedObject,
    };
  } catch (jsonError: any) {
    // JSONとして失敗した場合は YAML として試行
    try {
      const parsedObject = yaml.parse(raw);
      // 不正なYAMLのテスト: yaml.parseの結果が期待したオブジェクト構造（キーと値のペア）になっているかを簡易検証し、そうでなければエラーを投げるようにしてください。
      if (typeof parsedObject !== 'object' || parsedObject === null || Array.isArray(parsedObject)) {
        throw new Error('YAMLパース結果が期待されるオブジェクト構造ではありません。（オブジェクト、nullではない、配列ではない）');
      }
      return {
        yamlRaw: raw,
        parsedObject,
      };
    } catch (yamlError: any) {
      // 不正なYAML/JSON入力に対して確実に error フィールドにメッセージが設定されるように catch ブロックを確認してください。
      return {
        yamlRaw: raw,
        parsedObject: null,
        error: `JSON & YAML parse failed.\nJSON Error: ${jsonError.message}\nYAML Error: ${yamlError.message}`,
      };
    }
  }
}