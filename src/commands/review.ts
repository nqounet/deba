import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import yaml from 'yaml';
import { generateContent } from '../ai.js';
import { saveSnapshot } from '../snapshot.js';
import { buildReflectionPrompt } from '../prompt.js';
import { extractAndParseYaml } from '../yamlParser.js';
import { saveEpisode } from '../episode.js';
import { appendGrowthLog } from '../growthLog.js';
import { saveKnowledge, Knowledge } from '../knowledge.js';
import { getMainRepoRoot, getRepoStorageRoot, getWorktreePath, mergeWorktree, removeWorktree } from '../utils/git.js';
import { loadConfig } from '../utils/config.js';

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

export async function reviewCommand(taskId: string, options: { yes?: boolean, approve?: boolean, message?: string } = {}) {
  const snapshotDir = path.join(getRepoStorageRoot(), 'snapshots', taskId);

  try {
    await fs.access(snapshotDir);
  } catch {
    throw new Error(`Snapshot directory not found: ${snapshotDir}`);
  }

  let originalRequest = '(不明)';
  try {
    const phaseAInput = await fs.readFile(path.join(snapshotDir, 'phase_a_input.md'), 'utf-8');
    originalRequest = phaseAInput.substring(0, 200) + '...';
  } catch {
    try {
      const input = await fs.readFile(path.join(snapshotDir, 'input.md'), 'utf-8');
      originalRequest = input.substring(0, 200) + '...';
    } catch {
      // ignore
    }
  }

  const files = await fs.readdir(snapshotDir);
  const stepFiles = files.filter(f => f.startsWith('step_') && f.endsWith('_output_raw.txt'));
  const stepsExecuted = stepFiles.map(f => {
    const match = f.match(/step_(\d+)_output_raw\.txt/);
    return match ? `Step ${match[1]}` : f;
  });

  console.log(`\n--- Review Task: ${taskId} ---`);
  console.log(`Steps executed: ${stepsExecuted.join(', ') || 'N/A'}`);
  console.log(`\nCheck snapshots/${taskId}/ for detailed inputs/outputs.\n`);

  let answer = '';
  let isApproved = false;

  if (options.approve !== undefined) {
    isApproved = options.approve;
    answer = options.message || (isApproved ? 'y' : 'Needs fix');
  } else if (options.yes) {
    console.log('自動承認しました (--yes)');
    answer = 'y';
    isApproved = true;
  } else {
    answer = await askQuestion('承認しますか？ [y/修正内容を入力]: ');
    isApproved = answer.trim().toLowerCase() === 'y';
  }

  const episodePath = await saveEpisode({
    taskId,
    request: originalRequest,
    stepsExecuted,
    userFeedback: isApproved ? 'approved' : answer.trim(),
    success: isApproved,
  });

  if (isApproved) {
    console.log(`\n✅ タスクを承認しました。エピソードを記録し、完了です。`);

    const worktreeDir = getWorktreePath(taskId);
    try {
      await fs.access(worktreeDir);
      let shouldMerge = false;
      if (options.yes) {
        shouldMerge = true;
      } else {
        const mergeAnswer = await askQuestion(`\n隔離環境 (${worktreeDir}) の変更をメインにマージしてWorktreeを削除しますか？ [y/n]: `);
        shouldMerge = mergeAnswer.trim().toLowerCase() === 'y';
      }

      if (shouldMerge) {
        mergeWorktree(taskId);
        removeWorktree(worktreeDir, taskId);
        console.log(`\n✅ マージ完了。Worktree を削除しました。`);
      } else {
        console.log(`\n💡 Worktree は残してあります。後で確認できます: ${worktreeDir}`);
      }
    } catch {
      // ignore
    }
  } else {
    console.log(`\n🔄 修正内容を受け付けました。Reflection を実行します...`);

    const episodeSummary = `タスクID: ${taskId}\nユーザー要望: ${originalRequest}\n実行ステップ: ${stepsExecuted.join(', ')}`;

    let currentSkills = '';
    try {
      const skillsDir = path.join(getRepoStorageRoot(), 'brain', 'skills');
      const skillFiles = await fs.readdir(skillsDir);
      for (const sf of skillFiles) {
        if (sf.endsWith('.md')) {
          const content = await fs.readFile(path.join(skillsDir, sf), 'utf-8');
          currentSkills += `\n### ${sf}\n${content}\n`;
        }
      }
    } catch {
      // ignore
    }

    const reflectionPrompt = await buildReflectionPrompt(episodeSummary, answer.trim(), currentSkills);
    
    const systemInstruction = "あなたは自己評価を行う新人エンジニアです。指示に従い、YAML形式のみで出力してください。";
    const config = await loadConfig();
    const { text: reflectionText, meta } = await generateContent(reflectionPrompt, config.ai.execution, systemInstruction);

    await saveSnapshot(taskId, {
      input: reflectionPrompt,
      outputRaw: reflectionText,
      meta,
    }, 'reflection');

    const { parsedObject } = extractAndParseYaml(reflectionText);

    if (parsedObject) {
      console.log(`\n===== Reflection Result =====`);
      console.log(yaml.stringify(parsedObject));
      console.log(`=============================\n`);

      const learnings = parsedObject.learnings || [];
      for (const learning of learnings) {
        await appendGrowthLog({
          summary: learning.summary || '(要約なし)',
          generalizability: learning.generalizability || 'medium',
          relatedSkills: learning.related_skills || 'new',
          proposedRule: learning.proposed_rule,
          sourceEpisode: episodePath,
        });

        const knowledge: Knowledge = {
          summary: learning.summary || '(要約なし)',
          facts: [learning.proposed_rule || ''],
          inferences: [`Derived from episode: ${taskId}`, `Success state: false (needed correction)`],
          keywords: (learning.summary || '').split(/\s+/).concat(learning.related_skills || '').filter((k: string) => k.length > 2),
          confidence_score: learning.generalizability === 'high' ? 80 : 60,
        };
        const skrPath = await saveKnowledge(taskId, knowledge);
        console.log(`💾 Knowledge saved to SKR: ${skrPath}`);
      }

      if (parsedObject.reflection?.self_assessment) {
        console.log(`💭 自己評価: ${parsedObject.reflection.self_assessment}`);
      }
    } else {
      console.warn('⚠️ Reflection output could not be parsed as YAML.');
    }

    console.log(`\n✅ Reflection完了。学び候補が成長ログに追記されました。`);
  }
}
