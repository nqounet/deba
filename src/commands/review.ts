import * as fs from 'fs/promises';
import * as readline from 'readline';
import yaml from 'yaml';
import { getWorktreePath, mergeWorktree, removeWorktree } from '../utils/git-worktree.js';
import { getTrustLevelName } from '../trust.js';
import { getReviewContext, processReviewResult, executeReflection } from '../services/review.js';

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
  const context = await getReviewContext(taskId);

  console.log(`\n--- Review Task: ${taskId} ---`);
  console.log(`Steps executed: ${context.stepsExecuted.join(', ') || 'N/A'}`);
  
  // Worktree が存在すれば diff を表示
  const worktreeDir = getWorktreePath(taskId);
  try {
    await fs.access(worktreeDir);
    console.log(`\n--- Git Diff from Worktree ---`);
    const { execFileSync } = await import('child_process');
    try {
      const diff = execFileSync('git', ['diff', 'HEAD'], { cwd: worktreeDir, encoding: 'utf-8' });
      if (diff.trim()) {
        console.log(diff);
      } else {
        console.log('(No changes detected in Git)');
      }
    } catch (e: any) {
      console.warn(`⚠️ Could not get git diff: ${e.message}`);
    }
    console.log(`------------------------------\n`);
  } catch {
    console.log(`\nCheck snapshots/${taskId}/ for detailed inputs/outputs.\n`);
  }

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

  const { level, approvalRate, episodePath } = await processReviewResult(taskId, context, isApproved, answer.trim());

  console.log(`\n📊 信頼レベル: ${getTrustLevelName(level)} (直近の承認率: ${approvalRate}%)`);

  if (isApproved) {
    console.log(`\n✅ タスクを承認しました。エピソードを記録し、完了です。`);

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

    const { parsedObject } = await executeReflection(taskId, context, answer.trim(), episodePath);

    if (parsedObject) {
      console.log(`\n===== Reflection Result =====`);
      console.log(yaml.stringify(parsedObject));
      console.log(`=============================\n`);

      if (parsedObject.reflection?.self_assessment) {
        console.log(`💭 自己評価: ${parsedObject.reflection.self_assessment}`);
      }
    } else {
      console.warn('⚠️ Reflection output could not be parsed as YAML.');
    }

    console.log(`\n✅ Reflection完了。学び候補が成長ログに追記されました。`);
  }
}
