import yaml from 'yaml';
import { generateContent } from '../ai.js';
import { saveSnapshot, generateTaskId } from '../snapshot.js';
import { initQueueDirs, enqueueStep } from '../utils/queue.js';
import { loadConfig } from '../utils/config.js';
import { executePlanning } from '../services/planning.js';

export async function chatCommand(message: string) {
  const config = await loadConfig();
  const { text, meta } = await generateContent(message, config.ai.planning);
  
  console.log(`\n===== Response =====`);
  console.log(text);
  console.log(`====================\n`);

  const taskId = generateTaskId();
  const snapshotDir = await saveSnapshot(taskId, {
    input: message,
    outputRaw: text,
    meta: meta,
  });

  console.log(`[Snapshot saved to ${snapshotDir}]`);
}

export async function planCommand(request: string, options: { file?: string[] }) {
  const taskId = generateTaskId();
  const config = await loadConfig();
  
  const { parsedObject, error, snapshotDir } = await executePlanning(taskId, request, options);

  console.log(`\n===== Planning Output (Parsed) =====`);
  if (parsedObject) {
    console.log(yaml.stringify(parsedObject));
    
    // ステップをキューに投入
    const steps = parsedObject.implementation_plan?.steps || [];
    if (steps.length > 0) {
      await initQueueDirs();
      console.log(`\nEnqueuing ${steps.length} steps to todo queue...`);
      for (const step of steps) {
        const filename = await enqueueStep(taskId, step);
        console.log(`  [Enqueued] ${filename}`);
      }
    }
  } else {
    console.error('Parse Error:', error);
  }
  console.log(`===================================\n`);

  console.log(`[Snapshot saved to ${snapshotDir}]`);
}
