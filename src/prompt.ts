import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadSkills } from './skills.js';
import { searchKnowledge, formatKnowledgeForPrompt } from './knowledge.js';
import { getMainRepoRoot, getRepoStorageRoot } from './utils/git.js';
import { loadIngestion } from './ingestion.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// テンプレートのパス (debaプロジェクト内の相対パス)
const DEBA_PROJECT_ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(DEBA_PROJECT_ROOT, 'templates');
const EPISODES_DIR = path.join(getRepoStorageRoot(), 'brain', 'episodes');

/**
 * テンプレートファイルを読み込む
 */
async function loadTemplate(name: string): Promise<string> {
  const filePath = path.join(TEMPLATES_DIR, `${name}.md`);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    throw new Error(`テンプレートファイルの読み込みに失敗しました: ${filePath} - ${error.message}`);
  }
}

/**
 * 直近のエピソード記録を最大N件読み込む
 */
async function loadRecentEpisodes(maxCount: number = 5): Promise<string> {
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
 * プロンプトテンプレートを読み込み、変数を注入してPhase A用プロンプトを構築する
 * @returns { prompt, skillCount } プロンプト文字列と注入されたスキル数
 */
export async function buildPhaseAPrompt(request: string, targetFilePaths: string[] = []): Promise<string> {
  let template = await loadTemplate('phase_a');

  template = template.replace(/\{\{USER_REQUEST\}\}/g, request);
  
  const ingestionContent = await loadIngestion();
  template = template.replace(/\{\{PROJECT_SUMMARY\}\}/g, ingestionContent);

  let targetSourceCode = '※変更対象ファイルの指定なし';
  if (targetFilePaths.length > 0) {
    const fileContents: string[] = [];
    for (const filePath of targetFilePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        fileContents.push(`--- ${filePath} ---\n${content}\n`);
      } catch (fileError: any) {
        // ここでのエラーは致命的ではないため、警告とユーザー向けメッセージとして処理
        console.warn(`変更対象ファイルの読み込みに失敗しました: ${filePath} - ${fileError.message}`);
        fileContents.push(`--- ${filePath} ---\n※ファイルの読み込み失敗: ${fileError.message}\n`);
      }
    }
    targetSourceCode = fileContents.join('');
  }
  template = template.replace(/\{\{TARGET_SOURCE_CODE\}\}/g, targetSourceCode);
  template = template.replace(/\{\{DEPENDENCY_INTERFACES\}\}/g, '※記録なし');

  // 意味記憶（スキル）の注入
  const skills = await loadSkills();
  
  // 知識ベース（SKR）の検索と注入
  // 要望に含まれる単語からキーワードを抽出
  const searchKeywords = request
    .split(/[\s,，.．、。]+/)
    .filter(w => w.length > 1 && !/^(あ|い|う|え|お|は|の|に|を|と|が|で|も)$/.test(w));
  
  const allKeywords = Array.from(new Set([...searchKeywords, request]));
  const uniqueKnowledgeResults = await searchKnowledge(allKeywords);

  if (uniqueKnowledgeResults.length > 0) {
    console.log(`💡 知識ベース(SKR)から ${uniqueKnowledgeResults.length} 件の知見を注入しました (Top: ${uniqueKnowledgeResults[0].content.summary})`);
  }
  const knowledgePrompt = formatKnowledgeForPrompt(uniqueKnowledgeResults.slice(0, 5)); // 上位5件に絞る

  // スキルと知識ベースの内容を結合して注入
  const combinedMemory = `## 承認済みスキル\n${skills || '※まだ蓄積されたスキルなし'}\n\n## 過去の知見 (Knowledge Base)\n${knowledgePrompt}`;
  template = template.replace(/\{\{SEMANTIC_MEMORY\}\}/g, combinedMemory);

  // エピソード記憶の注入
  const episodes = await loadRecentEpisodes();
  template = template.replace(/\{\{RELATED_EPISODES\}\}/g, episodes);

  return template;
}

/**
 * Phase B (軽量モデル) 向けの指示遂行型プロンプトを構築する
 */
export async function buildPhaseBPrompt(
  stepDescription: string,
  targetFileContent: string,
  cautionsFromPhaseA: any[]
): Promise<string> {
  let template = await loadTemplate('phase_b');

  const formattedCautions = cautionsFromPhaseA && cautionsFromPhaseA.length > 0
    ? cautionsFromPhaseA.map((c: any) => `- [${c.context}] ${c.instruction}`).join('\n')
    : '特になし';

  template = template.replace('{{STEP_DESCRIPTION}}', stepDescription);
  template = template.replace('{{TARGET_FILE_CONTENT}}', targetFileContent || '（新規ファイルまはた内容なし）');
  template = template.replace('{{CAUTIONS}}', formattedCautions);

  return template;
}

/**
 * Phase C (Reflection) 向けプロンプトを構築する
 * 修正ありのタスクに対し、LLMに自己評価と学び候補の抽出を求める
 */
export async function buildReflectionPrompt(
  episodeSummary: string,
  userCorrections: string,
  currentSkills: string
): Promise<string> {
  let template = await loadTemplate('reflection');

  template = template.replace('{{EPISODE_SUMMARY}}', episodeSummary);
  template = template.replace('{{USER_CORRECTIONS}}', userCorrections);
  template = template.replace('{{CURRENT_SKILLS}}', currentSkills || '（まだスキルの蓄積なし）');

  return template;
}

/**
 * 成功したタスクから汎用的なスキルを抽出するためのプロンプトを構築する
 */
export async function buildSkillSuggestionPrompt(
  taskDescription: string,
  taskResult: string
): Promise<string> {
  let template = await loadTemplate('skill_suggestion');

  template = template.replace('{{TASK_DESCRIPTION}}', taskDescription);
  template = template.replace('{{TASK_RESULT}}', taskResult);

  return template;
}

/**
 * Ingestion用プロンプトを構築する
 */
export async function buildIngestionPrompt(fileTree: string, contextFiles: string): Promise<string> {
  let template = await loadTemplate('ingestion');
  template = template.replace('{{FILE_TREE}}', fileTree);
  template = template.replace('{{CONTEXT_FILES}}', contextFiles);
  return template;
}

/**
 * メンテナンス（整形）用プロンプトを構築する
 */
export async function buildMaintenancePrompt(content: string): Promise<string> {
  let template = await loadTemplate('maintenance');
  return template.replace('{{CONTENT}}', content);
}

/**
 * 修復用プロンプトを構築する
 */
export async function buildRepairPrompt(errorDetail: string): Promise<string> {
  let template = await loadTemplate('repair');
  return template.replace('{{ERROR_DETAIL}}', errorDetail);
}
