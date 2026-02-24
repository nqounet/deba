import * as readline from 'readline';
import { listSkills as listSkillsInfo, promoteToSkill } from '../skills.js';
import { cleanWorktrees } from '../utils/git.js';
import { cleanSnapshots } from '../utils/clean.js';
import { getPendingLearnings, markAsApproved } from '../growthLog.js';

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

export async function cleanCommand(options: { days: string }) {
  console.log('🧹 Cleaning up workspace...');
  cleanWorktrees();
  const days = parseInt(options.days, 10);
  await cleanSnapshots(days);
  console.log('✨ Cleanup complete.');
}

export async function skillsCommand() {
  const { display } = await listSkillsInfo();
  console.log(`\n${display}\n`);
}

export async function skillsPromoteCommand(rule: string, options: { project: string }) {
  await promoteToSkill(rule, options.project);
  console.log(`✅ スキルに昇格しました: ${rule}`);
}

export async function promoteLearningsCommand(options: { yes?: boolean }) {
  const pending = await getPendingLearnings();

  if (pending.length === 0) {
    console.log('✨ 承認待ちの学びはありません。');
    return;
  }

  console.log(`\n📝 ${pending.length} 件の承認待ちの学びがあります。\n`);

  for (const item of pending) {
    console.log('---');
    console.log(`学び: ${item.summary}`);
    if (item.proposedRule) {
      console.log(`提案ルール: ${item.proposedRule}`);
    }
    console.log(`汎用性: ${item.generalizability}`);

    let shouldPromote = false;
    if (options.yes) {
      console.log('\n自動承認しました (--yes)');
      shouldPromote = true;
    } else {
      const answer = await askQuestion('\nこの学びをスキルに昇格しますか？ [y/n/skip]: ');
      if (answer.toLowerCase() === 'y') {
        shouldPromote = true;
      }
    }
    
    if (shouldPromote) {
      const rule = item.proposedRule || item.summary;
      await promoteToSkill(rule, 'default');
      await markAsApproved(item.summary, item.filepath);
      console.log('✅ 承認し、スキルに昇格しました。');
    } else {
      console.log('⏩ スキップしました。');
    }
  }

  console.log('\n✨ すべての項目の確認が完了しました。');
}
