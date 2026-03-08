import * as fs from 'fs/promises';
import * as path from 'path';
import { getRepoStorageRoot } from './utils/git.js';

const EPISODES_DIR = path.join(getRepoStorageRoot(), 'brain', 'episodes');

export interface EpisodeData {
  taskId: string;
  request: string;
  stepsExecuted: string[];       // 実行されたステップの概要リスト
  userFeedback: 'approved' | string;  // 'approved' or 修正内容テキスト
  success: boolean;
  selfAssessment?: string;       // Reflection結果から埋める（後で更新可能）
}

/**
 * 直近のエピソード記録を最大N件読み込む
 */
export async function loadRecentEpisodes(maxCount: number = 5): Promise<string> {
  try {
    try {
      await fs.access(EPISODES_DIR);
    } catch {
      // ディレクトリが存在しない場合はエラーにせず空の結果を返す
      return '※記録なし';
    }
    const files = await fs.readdir(EPISODES_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md')).sort().reverse().slice(0, maxCount);
    if (mdFiles.length === 0) return '※記録なし';

    let combined = '';
    for (const file of mdFiles) {
      const filePath = path.join(EPISODES_DIR, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        combined += `\n---\n${content}\n`;
      } catch (fileError: any) {
        // 個別のエピソードファイル読み込みエラーは、全体の処理を中断せず、エラーメッセージとして含める
        console.error(`エピソードファイルの読み込みに失敗しました: ${filePath} - ${fileError.message}`);
        combined += `\n---\n※エピソードファイルの読み込み失敗: ${fileError.message}\n`;
      }
    }
    return combined;
  } catch (dirError: any) {
    // ディレクトリが存在しないなどのエラー
    console.error(`エピソードディレクトリの読み込みに失敗しました: ${EPISODES_DIR} - ${dirError.message}`);
    return '※記録なし';
  }
}

/**
 * エピソード記録をMarkdownファイルとして保存する
 * 保存先: brain/episodes/{date}_{seq}.md
 */
export async function saveEpisode(episode: EpisodeData): Promise<string> {
  await fs.mkdir(EPISODES_DIR, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // yyyy-mm-dd

  // 連番を決定（同日の既存ファイル数 + 1）
  let seq = 1;
  try {
    const files = await fs.readdir(EPISODES_DIR);
    const todayFiles = files.filter(f => f.startsWith(dateStr));
    seq = todayFiles.length + 1;
  } catch {
    // ディレクトリが空の場合など
  }

  const seqStr = String(seq).padStart(3, '0');
  const filename = `${dateStr}_${seqStr}.md`;
  const filepath = path.join(EPISODES_DIR, filename);

  const stepsSection = episode.stepsExecuted.length > 0
    ? episode.stepsExecuted.map(s => `  - ${s}`).join('\n')
    : '  - (なし)';

  const feedbackSection = episode.success
    ? '承認（修正なし）'
    : episode.userFeedback;

  const content = `# Episode: ${episode.taskId}

- **日時**: ${now.toISOString()}
- **タスクID**: ${episode.taskId}
- **ユーザー指示**: ${episode.request}
- **実行ステップ**:
${stepsSection}
- **結果**: ${episode.success ? '✅ 承認' : '🔧 修正あり'}
- **ユーザーフィードバック**: ${feedbackSection}
${episode.selfAssessment ? `- **自己評価**: ${episode.selfAssessment}` : ''}
`;

  await fs.writeFile(filepath, content, 'utf-8');
  console.log(`📝 Episode saved: ${filepath}`);
  return filepath;
}
