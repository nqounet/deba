import * as fs from 'fs/promises';
import * as path from 'path';
import { initQueueDirs, getQueueDirPath, moveTask } from '../utils/queue.js';
import { executeStep } from '../runner.js';
import { createWorktree } from '../utils/git.js';

export async function workerCommand() {
  console.log('Deba Worker 起動中...');
  
  try {
    await initQueueDirs();
    console.log('✅ キューディレクトリが準備できました。監視を開始します。 (Ctrl+C で終了)');
    
    const todoDir = getQueueDirPath('todo');
    
    // 無限ループで監視
    while (true) {
      const files = await fs.readdir(todoDir);
      const taskFiles = files.filter(f => f.endsWith('.json')).sort();
      
      if (taskFiles.length === 0) {
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
          
          // Worktree の準備（既存の executeBatches のロジックを参考）
          // タスクごとに専用の隔離環境を作成する
          const worktreeDir = createWorktree(taskId);
          
          // ステップの実行
          // cautions は本来 Phase A 出力に含まれるが、ここでは簡易化のため空配列を渡す
          // 必要に応じて taskData に含めるように plan.ts を修正することも検討
          const result = await executeStep(taskData, [], taskId, worktreeDir);
          
          if (result.testResult && result.testResult.code !== 0) {
             throw new Error(`Test failed for step ${taskData.id}`);
          }
          
          // doing -> done へ移動
          await moveTask(filename, 'doing', 'done');
          console.log(`[Worker] ✅ Task completed: ${filename}`);
          
        } catch (error: any) {
          console.error(`[Worker] ❌ Task failed: ${filename} - ${error.message}`);
          try {
            await moveTask(filename, 'doing', 'failed');
          } catch (moveError: any) {
            console.error(`[Worker] Critical: Failed to move to failed queue: ${moveError.message}`);
          }
        }
      }
    }
    
  } catch (error: any) {
    console.error(`❌ Workerで致命的なエラーが発生しました: ${error.message}`);
    process.exit(1);
  }
}
