import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const KNOWLEDGE_DIR = path.join(os.homedir(), '.agents', 'knowledges');

export interface Knowledge {
  summary: string;
  facts: string[];
  inferences: string[];
  keywords: string[];
  confidence_score: number;
}

export interface KnowledgeResult {
  filename: string;
  content: Knowledge;
}

/**
 * キーワードに基づいて知識ベースを検索する
 */
export async function searchKnowledge(query: string): Promise<KnowledgeResult[]> {
  try {
    const entries = await fs.readdir(KNOWLEDGE_DIR);
    const jsonFiles = entries.filter(f => f.endsWith('.json'));
    
    const results: KnowledgeResult[] = [];
    const queryLower = query.toLowerCase();

    for (const file of jsonFiles) {
      const filePath = path.join(KNOWLEDGE_DIR, file);
      const raw = await fs.readFile(filePath, 'utf-8');
      const content = JSON.parse(raw) as Knowledge;

      const searchText = [
        content.summary,
        ...(content.keywords || []),
        ...(content.facts || []),
        file
      ].join(' ').toLowerCase();

      if (searchText.includes(queryLower)) {
        results.push({ filename: file, content });
      }
    }
    return results;
  } catch (error) {
    // ディレクトリがない場合は空の結果を返す
    return [];
  }
}

/**
 * 知識を保存する
 */
export async function saveKnowledge(filename: string, knowledge: Knowledge): Promise<string> {
  await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });

  let baseName = filename.endsWith('.json') ? filename : `${filename}.json`;
  let filePath = path.join(KNOWLEDGE_DIR, baseName);

  // ファイル名の重複を避ける
  let counter = 1;
  const originalBaseName = path.basename(baseName, '.json');
  while (true) {
    try {
      await fs.access(filePath);
      filePath = path.join(KNOWLEDGE_DIR, `${originalBaseName}-${counter}.json`);
      counter++;
    } catch {
      break;
    }
  }

  await fs.writeFile(filePath, JSON.stringify(knowledge, null, 2));
  return filePath;
}

/**
 * 検索結果をプロンプト用の文字列にフォーマットする
 */
export function formatKnowledgeForPrompt(results: KnowledgeResult[]): string {
  if (results.length === 0) return '※関連する既知の知見なし';

  return results.map(r => {
    const facts = (r.content.facts || []).map(f => `  - ${f}`).join('\n');
    const inferences = (r.content.inferences || []).map(i => `  - ${i}`).join('\n');
    const keywords = (r.content.keywords || []).join(', ');
    
    return `### Knowledge: ${r.content.summary} (Source: ${r.filename})
- **Facts**:
${facts}
- **Inferences**:
${inferences}
- **Keywords**: ${keywords}`;
  }).join('\n---\n');
}
