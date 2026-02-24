import yaml from 'yaml';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';

export interface ParseResult {
  yamlRaw: string;
  parsedObject: any | null;
  error?: string;
}

/**
 * テキストからコードブロックを抽出し、パースする
 * remark を使用して Markdown AST から安全に抽出を行う
 */
export function extractAndParseYaml(text: string): ParseResult {
  let raw = '';
  
  try {
    // remark を同期的に使用して AST を生成
    // remark() は unified 構成の糖衣構文。
    const processor = remark().use(remarkGfm);
    const ast = processor.parse(text);

    const codeBlocks: string[] = [];
    
    // AST を巡回してコードブロックを探す
    visit(ast, 'code', (node: any) => {
      // json または yaml 言語指定があるもの、または指定がないものを候補とする
      if (!node.lang || node.lang === 'json' || node.lang === 'yaml') {
        codeBlocks.push(node.value);
      }
    });

    if (codeBlocks.length > 0) {
      // 最初の有効そうなブロックを採用
      raw = codeBlocks[0].trim();
    } else {
      // コードブロックが見つからない場合、テキスト全体を試行（以前の互換性のため）
      raw = text.trim();
    }
  } catch (parseError: any) {
    // Markdown 自体のパースに失敗した場合はフォールバック
    raw = text.trim();
  }

  if (!raw || raw === '```') {
    return { yamlRaw: '', parsedObject: null };
  }

  // まず JSON として試行
  try {
    const parsedObject = JSON.parse(raw);
    if (typeof parsedObject === 'object' && parsedObject !== null && !Array.isArray(parsedObject)) {
      return { yamlRaw: raw, parsedObject };
    }
    // 配列などの場合は YAML 試行へ流す
  } catch (e) {
    // JSON 失敗時は無視
  }

  // YAML として試行
  try {
    const parsedObject = yaml.parse(raw);
    if (typeof parsedObject === 'object' && parsedObject !== null && !Array.isArray(parsedObject)) {
      return { yamlRaw: raw, parsedObject };
    }
    return {
      yamlRaw: raw,
      parsedObject: null,
      error: 'パース結果がオブジェクト形式ではありません。',
    };
  } catch (yamlError: any) {
    return {
      yamlRaw: raw,
      parsedObject: null,
      error: `JSON & YAML parse failed.\nYAML Error: ${yamlError.message}`,
    };
  }
}
