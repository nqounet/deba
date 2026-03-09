import * as fs from 'fs/promises';
import * as path from 'path';
import { getRepoStorageRoot } from './utils/git-base.js';

const BRAIN_DIR = path.join(getRepoStorageRoot(), 'brain');
const SKILLS_DIR = path.join(BRAIN_DIR, 'skills');

/**
 * brain/skills/ 配下の全Markdownファイルを読み込み、結合して返す
 */
export async function loadSkills(): Promise<string> {
  try {
    await fs.mkdir(SKILLS_DIR, { recursive: true });
    const files = await fs.readdir(SKILLS_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    if (mdFiles.length === 0) {
      return '';
    }

    let combined = '';
    for (const file of mdFiles) {
      const content = await fs.readFile(path.join(SKILLS_DIR, file), 'utf-8');
      combined += `\n---\n### ${file}\n${content}\n`;
    }
    return combined;
  } catch {
    return '';
  }
}

/**
 * スキル一覧を整形して返す
 */
export async function listSkills(): Promise<{ count: number; display: string }> {
  try {
    await fs.mkdir(SKILLS_DIR, { recursive: true });
    const files = await fs.readdir(SKILLS_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    if (mdFiles.length === 0) {
      return { count: 0, display: '📚 獲得スキル: なし\n\n`deba review` でタスクをレビューし、学びを蓄積してください。' };
    }

    let display = `📚 獲得スキル: ${mdFiles.length}件\n`;
    for (const file of mdFiles) {
      const content = await fs.readFile(path.join(SKILLS_DIR, file), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().startsWith('- '));
      display += `\n### ${file.replace('.md', '')}\n`;
      if (lines.length > 0) {
        display += lines.join('\n') + '\n';
      } else {
        display += `${content.substring(0, 200)}...\n`;
      }
    }
    return { count: mdFiles.length, display };
  } catch {
    return { count: 0, display: '📚 獲得スキル: 読み込みエラー' };
  }
}

/**
 * 学び候補をスキルファイルに昇格（追記）する
 */
export async function promoteToSkill(proposedRule: string, projectName: string = 'default'): Promise<string> {
  await fs.mkdir(SKILLS_DIR, { recursive: true });
  
  const filename = `${projectName}_conventions.md`;
  const filepath = path.join(SKILLS_DIR, filename);

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  let existingContent = '';
  try {
    existingContent = await fs.readFile(filepath, 'utf-8');
  } catch {
    existingContent = `# ${projectName}: コーディング規約\n`;
  }

  const newRule = `- ${proposedRule} (${dateStr} 学習)\n`;
  await fs.writeFile(filepath, existingContent + newRule, 'utf-8');
  
  console.log(`✅ スキルに昇格: ${proposedRule}`);
  return filepath;
}
