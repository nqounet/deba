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
 * 複数のキーワードに基づいて知識ベースを検索し、関連度順にソートして返す
 */
export async function searchKnowledge(queries: string[]): Promise<KnowledgeResult[]> {
  try {
    const entries = await fs.readdir(KNOWLEDGE_DIR);
    const jsonFiles = entries.filter(f => f.endsWith('.json'));
    
    const scoredResults: { score: number; result: KnowledgeResult }[] = [];
    const queryLowers = queries.map(q => q.toLowerCase()).filter(q => q.length > 0);

    if (queryLowers.length === 0) return [];

    for (const file of jsonFiles) {
      const filePath = path.join(KNOWLEDGE_DIR, file);
      const raw = await fs.readFile(filePath, 'utf-8');
      const content = JSON.parse(raw) as Knowledge;

      const summaryLower = (content.summary || '').toLowerCase();
      const keywordsLower = (content.keywords || []).map(k => k.toLowerCase());
      const factsLower = (content.facts || []).map(f => f.toLowerCase());

      let score = 0;
      for (const query of queryLowers) {
        // サマリーに含まれる場合は高いスコア
        if (summaryLower.includes(query)) score += 10;
        // キーワードに完全一致する場合は高いスコア
        if (keywordsLower.includes(query)) score += 5;
        // 事実に含まれる場合は中程度のスコア
        if (factsLower.some(f => f.includes(query))) score += 3;
        // キーワードに部分一致する場合
        if (keywordsLower.some(k => k.includes(query))) score += 2;
      }

      if (score > 0) {
        scoredResults.push({
          score,
          result: { filename: file, content }
        });
      }
    }

    // スコア降順でソートして、KnowledgeResultのみを返す
    return scoredResults
      .sort((a, b) => b.score - a.score)
      .map(sr => sr.result);
  } catch (error) {
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

  try {
    await fs.writeFile(filePath, JSON.stringify(knowledge, null, 2));
  } catch (error: any) {
    throw new Error(`知識の保存に失敗しました: ${path.basename(filePath)} - ${error.message}`);
  }
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
