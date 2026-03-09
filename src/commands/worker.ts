import * as fs from 'fs/promises';
import { initQueueDirs, getQueueDirPath } from '../utils/queue.js';
import { recoverStaleTasks, processTask } from '../services/worker.js';

const POLL_INTERVAL_MS = 3000; // 3 seconds

export async function workerCommand(options: { once?: boolean } = {}) {
  console.log('Deba Worker 起動中...');
  
  try {
    await initQueueDirs();
    await recoverStaleTasks();

    console.log('✅ キューディレクトリが準備できました。監視を開始します。 (Ctrl+C で終了)');
    
    const todoDir = getQueueDirPath('todo');
    
    while (true) {
      const files = await fs.readdir(todoDir);
      const taskFiles = files.filter(f => f.endsWith('.json')).sort();
      
      if (taskFiles.length === 0) {
        if (options.once) break;
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }
      
      for (const filename of taskFiles) {
        await processTask(filename);
      }

      if (options.once) break;
    }
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Workerで致命的なエラーが発生しました: ${message}`);
    process.exit(1);
  }
}
