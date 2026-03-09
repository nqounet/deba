import * as fs from 'fs/promises';
import * as path from 'path';
import { getQueueDirPath, moveTask, touchTask } from '../utils/queue.js';
import { executeStep } from '../runner.js';
import { createWorktree, getRepoStorageRoot } from '../utils/git.js';
import { buildSkillSuggestionPrompt } from '../prompt.js';
import { generateContent } from '../ai.js';
import { extractAndParseYaml } from '../yamlParser.js';
import { loadConfig } from '../utils/config.js';

const PROPOSALS_DIR = path.join(getRepoStorageRoot(), 'brain', 'skills', 'proposals');
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute

export async function suggestSkillFromSuccess(taskDescription: string, taskResult: string) {
  console.log(`\n[Worker] 💡 成功体験からスキルを抽出しています...`);
  
  try {
    const prompt = await buildSkillSuggestionPrompt(taskDescription, taskResult);
    const config = await loadConfig();
    const { text } = await generateContent(prompt, config.ai.execution);
    
    const { parsedObject } = extractAndParseYaml(text);
    if (parsedObject && parsedObject.skill) {
      const skill = parsedObject.skill;
      const filename = `${skill.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
      const filePath = path.join(PROPOSALS_DIR, filename);
      
      await fs.mkdir(PROPOSALS_DIR, { recursive: true });
      
      const content = `# Skill Proposal: ${skill.name}\n\n${skill.summary}\n\n## Rule\n${skill.rule}\n\n<!-- metadata\n${JSON.stringify(skill, null, 2)}\n-->`;
      await fs.writeFile(filePath, content, 'utf-8');
      
      console.log(`[Worker] ✨ 新しいスキル候補を提案しました: ${filename}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Worker] スキル抽出に失敗しました（スキップします）: ${message}`);
  }
}

export async function recoverStaleTasks() {
  const doingDir = getQueueDirPath('doing');
  try {
    const files = await fs.readdir(doingDir);
    const now = Date.now();

    for (const filename of files) {
      if (!filename.endsWith('.json')) continue;
      const filePath = path.join(doingDir, filename);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtimeMs > STALE_THRESHOLD_MS) {
        console.log(`[Worker] 🛠️ 停滞しているタスクを復旧しています (10分以上更新なし): ${filename}`);
        try {
          await moveTask(filename, 'doing', 'todo');
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[Worker] タスクの復旧に失敗しました: ${filename} - ${message}`);
        }
      }
    }
  } catch (error: unknown) {
    console.debug(`[Worker] No tasks to recover or error reading queue: ${error}`);
  }
}

export async function processTask(filename: string) {
  console.log(`\n[Worker] 🚀 New task detected: ${filename}`);
  
  try {
    await moveTask(filename, 'todo', 'doing');
    
    const taskPath = path.join(getQueueDirPath('doing'), filename);
    const taskData = JSON.parse(await fs.readFile(taskPath, 'utf-8'));
    
    const { taskId } = taskData;
    console.log(`[Worker] Executing step ${taskData.id} for task ${taskId}...`);
    
    const worktreeDir = createWorktree(taskId);
    
    const heartbeat = setInterval(async () => {
      await touchTask(filename, 'doing');
    }, HEARTBEAT_INTERVAL_MS);

    try {
      const result = await executeStep(taskData, [], taskId, worktreeDir);
      
      if (result.testResult && result.testResult.code !== 0) {
         throw new Error(`Test failed for step ${taskData.id}`);
      }
      
      await moveTask(filename, 'doing', 'done');
      console.log(`[Worker] ✅ Task completed: ${filename}`);
      
      await suggestSkillFromSuccess(taskData.description, result.text);
    } finally {
      clearInterval(heartbeat);
    }
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Worker] ❌ Task failed: ${filename} - ${message}`);
    try {
      await moveTask(filename, 'doing', 'failed');
    } catch (moveError: unknown) {
      const moveMsg = moveError instanceof Error ? moveError.message : String(moveError);
      console.error(`[Worker] Critical: Failed to move to failed queue: ${moveMsg}`);
    }
  }
}
