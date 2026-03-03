import * as fs from 'fs/promises';
import * as path from 'path';
import { getRepoStorageRoot } from './utils/git.js';

function getEpisodesDir(): string {
  return path.join(getRepoStorageRoot(), 'brain', 'episodes');
}

export interface EpisodeData {
  taskId: string;
  request: string;
  stepsExecuted: string[];       // 実行されたステップの概要リスト
  userFeedback: 'approved' | string;  // 'approved' or 修正内容テキスト
  success: boolean;
  selfAssessment?: string;       // Reflection結果から埋める（後で更新可能）
}

/**
 * エピソード記録をMarkdownファイルとして保存する
 * 保存先: brain/episodes/{date}_{seq}.md
 */
export async function saveEpisode(episode: EpisodeData): Promise<string> {
  const episodesDir = getEpisodesDir();
  await fs.mkdir(episodesDir, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // yyyy-mm-dd

  // 連番を決定（同日の既存ファイル数 + 1）
  let seq = 1;
  try {
    const files = await fs.readdir(episodesDir);
    const todayFiles = files.filter(f => f.startsWith(dateStr));
    seq = todayFiles.length + 1;
  } catch {
    // ディレクトリが空の場合など
  }

  const seqStr = String(seq).padStart(3, '0');
  const filename = `${dateStr}_${seqStr}.md`;
  const filepath = path.join(episodesDir, filename);

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
