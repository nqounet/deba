import { listSkills as listSkillsInfo, promoteToSkill } from '../skills.js';
import { cleanWorktrees } from '../utils/git.js';
import { cleanSnapshots } from '../utils/clean.js';

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
