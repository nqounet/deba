import * as fs from 'fs/promises';
import { watch } from 'fs';
import * as path from 'path';
import { initQueueDirs, getQueueDirPath, moveTask } from '../utils/queue.js';
import { executeStep } from '../runner.js';
import { createWorktree, getRepoStorageRoot } from '../utils/git.js';
import { buildWorkerEternalPrompt, buildSkillSuggestionPrompt } from '../prompt.js';
import { startChatSession, generateContent } from '../ai.js';
import { extractAndParseYaml } from '../yamlParser.js';
import { loadConfig } from '../utils/config.js';

const PROPOSALS_DIR = path.join(getRepoStorageRoot(), 'brain', 'skills', 'proposals');

/**
 * 成功体験からスキルを抽出する (以前と同様のロジックをラップ)
 */
async function suggestSkillFromSuccess(taskDescription: string, taskResult: string) {
  console.log(`\n[Worker] 💡 成功体験からスキルを抽出しています...`);
  
  try {
    const prompt = await buildSkillSuggestionPrompt(taskDescription, taskResult);
    const config = await loadConfig();
    const { text } = await generateContent(prompt, config.ai.flash_model);
    
    const { parsedObject } = extractAndParseYaml(text);
    if (parsedObject && parsedObject.skill) {
      const skill = parsedObject.skill;
      const filename = `${skill.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
      const filePath = path.join(PROPOSALS_DIR, filename);
      
      await fs.mkdir(PROPOSALS_DIR, { recursive: true });
      
      const content = `# Skill Proposal: ${skill.name}\n\n${skill.summary}\n\n## Rule\n${skill.rule}\n\n<!-- metadata\n${JSON.stringify(skill, null, 2)}\n-->`;
      await fs.writeFile(filePath, content, 'utf-8');
      
      console.log(`[Worker] ✨ 新しいスキル候補を提案しました: ${filename}`);
      return content;
    }
  } catch (error: any) {
    console.warn(`[Worker] スキル抽出に失敗しました（スキップします）: ${error.message}`);
  }
  return null;
}

/**
 * ファイルの変更を待機する Promise
 */
function waitForNextTask(dir: string): Promise<string> {
  return new Promise((resolve) => {
    const watcher = watch(dir, (eventType, filename) => {
      if (eventType === 'rename' && filename && filename.endsWith('.json')) {
        watcher.close();
        resolve(filename || 'unknown');
      }
    });
    console.log(`[Worker] 😴 キューを監視中... (${dir})`);
  });
}

/**
 * キューの状態を文字列で取得する
 */
async function getQueueStatus(): Promise<string> {
  const todoDir = getQueueDirPath('todo');
  const files = await fs.readdir(todoDir);
  const taskFiles = files.filter(f => f.endsWith('.json')).sort();
  
  if (taskFiles.length === 0) return 'キューは空です。';
  
  return `待機中のタスク (${taskFiles.length}件):\n${taskFiles.map(f => `- ${f}`).join('\n')}`;
}

export async function workerCommand(options: { once?: boolean } = {}) {
  console.log('🚀 Deba Eternal Worker 起動中...');
  
  try {
    await initQueueDirs();
    const todoDir = getQueueDirPath('todo');
    const doingDir = getQueueDirPath('doing');

    // 1. セッションの開始
    const session = await startChatSession();
    console.log('✨ LLM 永続セッションが開始されました。');

    while (true) {
      // 2. プロンプトの構築
      const queueStatus = await getQueueStatus();
      const prompt = await buildWorkerEternalPrompt(queueStatus);

      // 3. LLM への行動問い合わせ
      console.log('\n[Worker] 🤔 次の行動を検討中...');
      const { text } = await session.sendMessage(prompt);
      
      const { parsedObject } = extractAndParseYaml(text);
      if (!parsedObject || !parsedObject.action) {
        console.warn(`[Worker] ⚠️ LLMの応答を解釈できませんでした。待機します。\nRaw: ${text}`);
        if (options.once) break;
        await waitForNextTask(todoDir);
        continue;
      }

      const { action, task_file } = parsedObject;
      console.log(`[Worker] ⚡ Action: ${action} (${parsedObject.reasoning || '理由なし'})`);

      if (action === 'WAIT') {
        if (options.once) break;
        await waitForNextTask(todoDir);
        continue;
      }

      if (action === 'EXECUTE_TASK' && task_file) {
        const filename = task_file;
        try {
          // 実行
          await moveTask(filename, 'todo', 'doing');
          const taskPath = path.join(doingDir, filename);
          const taskData = JSON.parse(await fs.readFile(taskPath, 'utf-8'));
          
          const worktreeDir = createWorktree(taskData.taskId);
          const result = await executeStep(taskData, [], taskData.taskId, worktreeDir);
          
          if (result.testResult && result.testResult.code !== 0) {
            throw new Error(`Test failed for step ${taskData.id}`);
          }

          await moveTask(filename, 'doing', 'done');
          console.log(`[Worker] ✅ Task completed: ${filename}`);

          // 実行結果をセッションに報告
          await session.sendMessage(`TASK_COMPLETED: ${filename}\nResult: ${result.text.substring(0, 500)}...`);

        } catch (error: any) {
          console.error(`[Worker] ❌ Task failed: ${filename} - ${error.message}`);
          await moveTask(filename, 'doing', 'failed');
          await session.sendMessage(`TASK_FAILED: ${filename}\nError: ${error.message}`);
        }
      } else if (action === 'SUGGEST_SKILL') {
        console.log('[Worker] スキル抽出アクションは現在文脈に基づいて実行されます。');
      } else if (action === 'SELF_MAINTENANCE') {
        console.log('[Worker] 自己メンテナンス中...');
        if (!options.once) await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(`[Worker] 未知のアクションまたは対象なし: ${action}`);
        if (!options.once) await new Promise(resolve => setTimeout(resolve, 3000));
      }

      if (options.once) break;
    }
    
    if (session) await session.close();

  } catch (error: any) {
    console.error(`❌ Workerで致命的なエラーが発生しました: ${error.message}`);
    process.exit(1);
  }
}
