import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { listSkills as listSkillsInfo, promoteToSkill } from '../skills.js';
import { cleanWorktrees, getMainRepoRoot } from '../utils/git.js';
import { cleanSnapshots } from '../utils/clean.js';
import { getPendingLearnings, markAsApproved } from '../growthLog.js';

const PROPOSALS_DIR = path.join(getMainRepoRoot(), 'brain', 'skills', 'proposals');
const SKILLS_DIR = path.join(getMainRepoRoot(), 'brain', 'skills');

function askQuestion(query: string): Promise<string> {
// ... (existing code remains)
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
  // 1. スキル提案（Proposals）のチェック
  let proposals: string[] = [];
  try {
    const files = await fs.readdir(PROPOSALS_DIR);
    proposals = files.filter(f => f.endsWith('.md'));
  } catch {}

  if (proposals.length > 0) {
    console.log(`\n✨ ${proposals.length} 件の新しいスキル提案があります。\n`);
    for (const file of proposals) {
      const filePath = path.join(PROPOSALS_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      
      console.log('---');
      console.log(content);
      
      let shouldPromote = false;
      if (options.yes) {
        console.log('\n自動承認しました (--yes)');
        shouldPromote = true;
      } else {
        const answer = await askQuestion('\nこの提案を正式なスキルとして採用しますか？ [y/n/skip]: ');
        if (answer.toLowerCase() === 'y') {
          shouldPromote = true;
        }
      }
      
      if (shouldPromote) {
        await fs.mkdir(SKILLS_DIR, { recursive: true });
        await fs.rename(filePath, path.join(SKILLS_DIR, file));
        console.log('✅ 正式なスキルとして登録しました。');
      } else {
        console.log('⏩ スキップしました。');
      }
    }
  }

  // 2. 成長ログからの学び（Learnings）のチェック
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
