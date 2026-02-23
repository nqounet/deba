import yaml from 'yaml';

export interface ParseResult {
  yamlRaw: string;
  parsedObject: any | null;
  error?: string;
}

/**
 * テキストから ```yaml ... ``` ブロックを抽出し、パースする
 */
export function extractAndParseYaml(text: string): ParseResult {
  // yamlブロックを抽出。```yaml ... ``` (または単なる ``` ... ```の可能性も加味)
  const yamlBlockRegex = /```(?:yaml)?\s*([\s\S]*?)\s*```/i;
  const match = text.match(yamlBlockRegex);

  let yamlRaw = '';

  if (match && match[1]) {
    yamlRaw = match[1].trim();
  } else {
    // マークダウンブロックが無い場合、全体をYAMLとして試行する
    yamlRaw = text.trim();
  }

  try {
    const parsedObject = yaml.parse(yamlRaw);
    return {
      yamlRaw,
      parsedObject,
    };
  } catch (error: any) {
    return {
      yamlRaw,
      parsedObject: null,
      error: error.message || 'Unknown YAML parse error',
    };
  }
}
