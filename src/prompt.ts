import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { validateFilePaths } from './utils/sanitize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// テンプレートのパス (debaプロジェクト内の相対パス)
const DEBA_PROJECT_ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(DEBA_PROJECT_ROOT, 'src', 'templates');

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

export interface PlanningContext {
  ingestion: string;
  skills: string;
  episodes: string;
  knowledgePrompt: string;
}

/**
 * プロンプトテンプレートを読み込み、変数を注入してPlanning用プロンプトを構築する
 */
export async function buildPlanningPrompt(request: string, context: PlanningContext, targetFilePaths: string[] = []): Promise<string> {
  let template = await loadTemplate('planning');

  template = template.replace(/\{\{USER_REQUEST\}\}/g, request);
  template = template.replace(/\{\{PROJECT_SUMMARY\}\}/g, context.ingestion);

  let targetSourceCode = '※変更対象ファイルの指定なし';
  if (targetFilePaths.length > 0) {
    // パストラバーサル防止: プロジェクトルート外のパスをフィルタリング
    const projectRoot = process.cwd();
    const safePaths = validateFilePaths(targetFilePaths, projectRoot);
    
    const fileContents: string[] = [];
    for (const filePath of safePaths) {
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

  // スキルと知識ベースの内容を結合して注入
  const combinedMemory = `## 承認済みスキル\n${context.skills || '※まだ蓄積されたスキルなし'}\n\n## 過去の知見 (Knowledge Base)\n${context.knowledgePrompt}`;
  template = template.replace(/\{\{SEMANTIC_MEMORY\}\}/g, combinedMemory);

  // エピソード記憶の注入
  template = template.replace(/\{\{RELATED_EPISODES\}\}/g, context.episodes);

  return template;
}

/**
 * Execution (軽量モデル) 向けの指示遂行型プロンプトを構築する
 */
export async function buildExecutionPrompt(
  stepDescription: string,
  targetFileContent: string,
  cautionsFromPhaseA: any[]
): Promise<string> {
  let template = await loadTemplate('execution');

  const formattedCautions = cautionsFromPhaseA && cautionsFromPhaseA.length > 0
    ? cautionsFromPhaseA.map((c: any) => `- [${c.context}] ${c.instruction}`).join('\n')
    : '特になし';

  template = template.replace('{{STEP_DESCRIPTION}}', stepDescription);
  template = template.replace('{{TARGET_FILE_CONTENT}}', targetFileContent || '（新規ファイルまはた内容なし）');
  template = template.replace('{{CAUTIONS}}', formattedCautions);

  return template;
}

/**
 * Review (Reflection) 向けプロンプトを構築する
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
