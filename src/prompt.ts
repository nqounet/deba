import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSkills } from './skills.js';

// docs/drafts/phase_a_prompt_draft.md のパス
const PROMPT_TEMPLATE_PATH = path.join(process.cwd(), 'docs', 'drafts', 'phase_a_prompt_draft.md');
const EPISODES_DIR = path.join(process.cwd(), 'brain', 'episodes');

/**
 * 直近のエピソード記録を最大N件読み込む
 */
async function loadRecentEpisodes(maxCount: number = 5): Promise<string> {
  try {
    const files = await fs.readdir(EPISODES_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md')).sort().reverse().slice(0, maxCount);
    if (mdFiles.length === 0) return '※記録なし';

    let combined = '';
    for (const file of mdFiles) {
      const content = await fs.readFile(path.join(EPISODES_DIR, file), 'utf-8');
      combined += `\n---\n${content}\n`;
    }
    return combined;
  } catch {
    return '※記録なし';
  }
}

/**
 * プロンプトテンプレートを読み込み、変数を注入してPhase A用プロンプトを構築する
 * @returns { prompt, skillCount } プロンプト文字列と注入されたスキル数
 */
export async function buildPhaseAPrompt(request: string): Promise<string> {
  try {
    let template = await fs.readFile(PROMPT_TEMPLATE_PATH, 'utf-8');

    template = template.replace(/\{\{USER_REQUEST\}\}/g, request);
    template = template.replace(/\{\{PROJECT_SUMMARY\}\}/g, 'プロジェクトルート: /');
    template = template.replace(/\{\{TARGET_SOURCE_CODE\}\}/g, '※変更対象ファイルの指定なし');
    template = template.replace(/\{\{DEPENDENCY_INTERFACES\}\}/g, '※記録なし');

    // 意味記憶（スキル）の注入
    const skills = await loadSkills();
    template = template.replace(/\{\{SEMANTIC_MEMORY\}\}/g, skills || '※まだ蓄積されたスキルなし');

    // エピソード記憶の注入
    const episodes = await loadRecentEpisodes();
    template = template.replace(/\{\{RELATED_EPISODES\}\}/g, episodes);

    return template;
  } catch (error) {
    console.error('Failed to load phase_a_prompt_draft.md:', error);
    throw error;
  }
}

/**
 * Phase B (軽量モデル) 向けの指示遂行型プロンプトを構築する
 */
export function buildPhaseBPrompt(
  stepDescription: string,
  targetFileContent: string,
  cautionsFromPhaseA: any[]
): string {
  const formattedCautions = cautionsFromPhaseA && cautionsFromPhaseA.length > 0 
    ? cautionsFromPhaseA.map((c: any) => `- [${c.context}] ${c.instruction}`).join('\n')
    : '特になし';

  return `# 指示
以下の実装ステップを正確に実行してください。設計判断は不要です。

## 実装ステップ
${stepDescription}

## 対象ファイル
\`\`\`
${targetFileContent || '（新規ファイルまはた内容なし）'}
\`\`\`

## 注意事項
${formattedCautions}

## 曖昧性が生じた場合
実装の詳細が不明な場合は、変更を行わずに以下の形式で報告してください:
AMBIGUITY: （何が不明か）

## 出力
変更後のコードのみを出力してください。Markdownのコードブロック（\`\`\`）などの装飾も不要です。純粋なコードファイルの内容全体を出力してください。
`;
}

/**
 * Phase C (Reflection) 向けプロンプトを構築する
 * 修正ありのタスクに対し、LLMに自己評価と学び候補の抽出を求める
 */
export function buildReflectionPrompt(
  episodeSummary: string,
  userCorrections: string,
  currentSkills: string
): string {
  return `# Reflection Prompt

あなたは直前のタスクを振り返る新人エンジニアです。
以下の情報をもとに、自己評価と学びの抽出を行ってください。

## 直前のタスク
${episodeSummary}

## ユーザーの修正内容
${userCorrections}

## 既存スキル
${currentSkills || '（まだスキルの蓄積なし）'}

## 質問
1. ユーザーの修正から、どのような一般的なルールやパターンを学べますか？
2. この学びは、今後の別のタスクにも適用できますか？
3. 既存のスキルと矛盾する点はありますか？

## 出力形式（YAML）
以下のYAMLフォーマットで出力してください。YAML以外のテキストは出力しないでください。

\`\`\`yaml
reflection:
  what_happened: "（何が起きたか）"
  why_corrected: "（なぜユーザーが修正したか）"
  self_assessment: "（自己評価）"

learnings:
  - summary: "（学びの1文要約）"
    generalizability: "high | medium | project_specific"
    related_skills: "new | reinforce | modify:skill_name"
    proposed_rule: "（意味記憶に昇格する場合のルール文）"

episode_metadata:
  task_type: "（タスク種別）"
  complexity: 1
  success: false
  correction_severity: "minor | major | rejection"
\`\`\`
`;
}
