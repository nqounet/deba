import * as fs from 'fs/promises';
import * as path from 'path';
import { initQueueDirs, getQueueDirPath, moveTask, touchTask } from '../utils/queue.js';
import { executeStep } from '../runner.js';
import { createWorktree, getMainRepoRoot, getRepoStorageRoot } from '../utils/git.js';
import { buildSkillSuggestionPrompt } from '../prompt.js';
import { generateContent } from '../ai.js';
import { extractAndParseYaml } from '../yamlParser.js';

const PROPOSALS_DIR = path.join(getRepoStorageRoot(), 'brain', 'skills', 'proposals');

import { loadConfig } from '../utils/config.js';

// ... (他のインポートやコード)

async function suggestSkillFromSuccess(taskDescription: string, taskResult: string) {
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
      
      // Markdown 形式で保存
      const content = `# Skill Proposal: ${skill.name}\n\n${skill.summary}\n\n## Rule\n${skill.rule}\n\n<!-- metadata\n${JSON.stringify(skill, null, 2)}\n-->`;
      await fs.writeFile(filePath, content, 'utf-8');
      
      console.log(`[Worker] ✨ 新しいスキル候補を提案しました: ${filename}`);
    }
  } catch (error: any) {
    console.warn(`[Worker] スキル抽出に失敗しました（スキップします）: ${error.message}`);
  }
}

/**
 * 停滞している (doing のまま長時間放置されている) タスクを todo に戻す
 */
async function recoverStaleTasks() {
  const doingDir = getQueueDirPath('doing');
  try {
    const files = await fs.readdir(doingDir);
    const now = Date.now();
    const STALE_THRESHOLD = 10 * 60 * 1000; // 10 minutes

    for (const filename of files) {
      if (!filename.endsWith('.json')) continue;
      const filePath = path.join(doingDir, filename);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtimeMs > STALE_THRESHOLD) {
        console.log(`[Worker] 🛠️ 停滞しているタスクを復旧しています (10分以上更新なし): ${filename}`);
        try {
          await moveTask(filename, 'doing', 'todo');
        } catch (error: any) {
          console.error(`[Worker] タスクの復旧に失敗しました: ${filename} - ${error.message}`);
        }
      }
    }
  } catch (error) {
    // ディレクトリがない場合は無視
  }
}

export async function workerCommand(options: { once?: boolean } = {}) {
  console.log('Deba Worker 起動中...');
  
  try {
    await initQueueDirs();
    
    // 起動時に停滞タスクをチェック
    await recoverStaleTasks();

    console.log('✅ キューディレクトリが準備できました。監視を開始します。 (Ctrl+C で終了)');
    
    const todoDir = getQueueDirPath('todo');
    
    // 無限ループで監視
    while (true) {
      const files = await fs.readdir(todoDir);
      const taskFiles = files.filter(f => f.endsWith('.json')).sort();
      
      if (taskFiles.length === 0) {
        if (options.once) break;
        // タスクがなければ少し待機
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      
      for (const filename of taskFiles) {
        console.log(`\n[Worker] 🚀 New task detected: ${filename}`);
        
        try {
          // todo -> doing へ移動
          await moveTask(filename, 'todo', 'doing');
          
          const taskPath = path.join(getQueueDirPath('doing'), filename);
          const taskData = JSON.parse(await fs.readFile(taskPath, 'utf-8'));
          
          const { taskId } = taskData;
          console.log(`[Worker] Executing step ${taskData.id} for task ${taskId}...`);
          
          // Worktree の準備
          const worktreeDir = createWorktree(taskId);
          
          // ハートビート開始（1分ごとに更新）
          const heartbeat = setInterval(async () => {
            await touchTask(filename, 'doing');
          }, 60000);

          try {
            // ステップの実行
            const result = await executeStep(taskData, [], taskId, worktreeDir);
            
            if (result.testResult && result.testResult.code !== 0) {
               throw new Error(`Test failed for step ${taskData.id}`);
            }
            
            // doing -> done へ移動
            await moveTask(filename, 'doing', 'done');
            console.log(`[Worker] ✅ Task completed: ${filename}`);
            
            // 成功体験からのスキル提案
            await suggestSkillFromSuccess(taskData.description, result.text);
          } finally {
            clearInterval(heartbeat);
          }
          
        } catch (error: any) {
          console.error(`[Worker] ❌ Task failed: ${filename} - ${error.message}`);
          try {
            await moveTask(filename, 'doing', 'failed');
          } catch (moveError: any) {
            console.error(`[Worker] Critical: Failed to move to failed queue: ${moveError.message}`);
          }
        }
      }

      if (options.once) break;
    }
    
  } catch (error: any) {
    console.error(`❌ Workerで致命的なエラーが発生しました: ${error.message}`);
    process.exit(1);
  }
}
