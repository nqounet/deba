import * as fs from 'fs/promises';
import * as path from 'path';
import { getMainRepoRoot } from './utils/git.js';

const BRAIN_DIR = path.join(getMainRepoRoot(), 'brain');
const GROWTH_LOG_DIR = path.join(BRAIN_DIR, 'growth_log');

export interface LearningEntry {
  summary: string;
  generalizability: 'high' | 'medium' | 'project_specific';
  relatedSkills: string;  // 'new' | 'reinforce' | 'modify:skill_name'
  proposedRule?: string;
  sourceEpisode: string;  // エピソードファイルパス
}

/**
 * 成長ログに学び候補を追記する
 * 保存先: brain/growth_log/{year}-{month}.md
 */
export async function appendGrowthLog(entry: LearningEntry): Promise<string> {
  await fs.mkdir(GROWTH_LOG_DIR, { recursive: true });

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dateStr = now.toISOString().split('T')[0];

  const filename = `${year}-${month}.md`;
  const filepath = path.join(GROWTH_LOG_DIR, filename);

  // ファイルが存在しなければヘッダーを作成
  let existingContent = '';
  try {
    existingContent = await fs.readFile(filepath, 'utf-8');
  } catch {
    existingContent = `# Growth Log: ${year}年${parseInt(month)}月\n`;
  }

  const newEntry = `
## ${dateStr}

### 学び: ${entry.summary}
- **由来エピソード**: ${entry.sourceEpisode}
- **汎用性**: ${entry.generalizability === 'high' ? '高い' : entry.generalizability === 'medium' ? '中程度' : 'プロジェクト固有'}
- **既存スキルとの関係**: ${entry.relatedSkills}
- **承認状態**: 🟡 ユーザー承認待ち
- **活用実績**: (なし)
${entry.proposedRule ? `- **提案ルール**: ${entry.proposedRule}` : ''}
`;

  await fs.writeFile(filepath, existingContent + newEntry, 'utf-8');
  console.log(`📈 Growth log updated: ${filepath}`);
  return filepath;
}
