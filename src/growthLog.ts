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

export interface PendingLearning extends LearningEntry {
  filepath: string;
  date: string;
}

/**
 * 全ての成長ログから「承認待ち」の項目を取得する
 */
export async function getPendingLearnings(): Promise<PendingLearning[]> {
  const pending: PendingLearning[] = [];
  try {
    const files = await fs.readdir(GROWTH_LOG_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    for (const file of mdFiles) {
      const filepath = path.join(GROWTH_LOG_DIR, file);
      const content = await fs.readFile(filepath, 'utf-8');
      
      // ### 学び: で分割
      const sections = content.split('### 学び: ');
      // 最初のセクションはヘッダー（# Growth Log ...）なのでスキップ
      for (let i = 1; i < sections.length; i++) {
        const section = sections[i];
        if (section.includes('- **承認状態**: 🟡 ユーザー承認待ち')) {
          const lines = section.split('\n');
          const summary = lines[0].trim();
          
          const getVal = (label: string) => {
            const line = lines.find(l => l.includes(label));
            if (!line) return '';
            const parts = line.split(':');
            return parts.length > 1 ? parts.slice(1).join(':').trim() : '';
          };

          const proposedRule = getVal('提案ルール') || undefined;
          const genStr = getVal('汎用性');

          pending.push({
            summary,
            sourceEpisode: getVal('由来エピソード'),
            generalizability: genStr.includes('高い') ? 'high' : genStr.includes('中程度') ? 'medium' : 'project_specific',
            relatedSkills: getVal('既存スキルとの関係'),
            proposedRule,
            filepath,
            date: '' 
          });
        }
      }
    }
  } catch (e) {
    // ディレクトリがない場合など
  }
  return pending;
}

/**
 * 成長ログ内の特定の学びを「承認済み」に更新する
 */
export async function markAsApproved(summary: string, filepath: string): Promise<void> {
  const content = await fs.readFile(filepath, 'utf-8');
  const oldLine = `### 学び: ${summary}`;
  const statusLine = '- **承認状態**: 🟡 ユーザー承認待ち';
  const newStatusLine = '- **承認状態**: ✅ 承認済み';

  // 該当するセクションを探して、承認状態の行だけを置換する
  // 簡易的な実装として、summaryに一致する箇所の後の最初の「承認待ち」を置換
  const parts = content.split(oldLine);
  if (parts.length < 2) return;

  // 2番目以降の各パートの冒頭付近にあるステータスを置換
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].includes(statusLine)) {
      parts[i] = parts[i].replace(statusLine, newStatusLine);
      // 1箇所だけ置換して終了（重複は考慮しない）
      break;
    }
  }

  await fs.writeFile(filepath, parts.join(oldLine), 'utf-8');
}
