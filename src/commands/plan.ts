import yaml from 'yaml';
import { generateContent } from '../ai.js';
import { saveSnapshot, generateTaskId } from '../snapshot.js';
import { buildPhaseAPrompt } from '../prompt.js';
import { extractAndParseYaml } from '../yamlParser.js';
import { validatePhaseA } from '../validator.js';
import { initQueueDirs, enqueueStep } from '../utils/queue.js';
import { loadConfig } from '../utils/config.js';

export async function chatCommand(message: string) {
  console.log(`Sending message to LLM...`);
  const { text, meta } = await generateContent(message);
  
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
  console.log('Building Phase A prompt...');
  const prompt = await buildPhaseAPrompt(request, options.file);
  const config = await loadConfig();

  console.log(`Sending plan request to LLM (${config.ai.model})...`);
  const { text, meta } = await generateContent(prompt, config.ai.model);
  
  console.log('Extracting and parsing YAML...');
  let { yamlRaw, parsedObject, error } = extractAndParseYaml(text);

  const needsRepair = error || !parsedObject || typeof parsedObject !== 'object' || !validatePhaseA(parsedObject).isValid;
  
  if (needsRepair) {
    const errorDetail = error || (parsedObject && typeof parsedObject === 'object' ? validatePhaseA(parsedObject).errors.join(', ') : '出力が正しいオブジェクト形式ではありません');
    console.warn(`⚠️ YAML validation/parse error: ${errorDetail}`);
    console.log('Attempting self-healing (retry 1/1)...');
    
    const repairPrompt = `先ほど出力されたYAMLに不備がありました。\nエラー詳細: ${errorDetail}\n\n不足している情報を補完し、validなYAMLブロックのみを再出力してください。特に閉じクォートやインデント、必須フィールドの有無に注意してください。前置きは不要です。`;
    const { text: repairedText } = await generateContent(repairPrompt, config.ai.flash_model);
    
    const repairResult = extractAndParseYaml(repairedText);
    if (!repairResult.error && repairResult.parsedObject && typeof repairResult.parsedObject === 'object' && validatePhaseA(repairResult.parsedObject).isValid) {
      console.log('✅ Self-healing successful!');
      yamlRaw = repairResult.yamlRaw;
      parsedObject = repairResult.parsedObject;
      error = undefined;
    } else {
      console.error(`❌ Self-healing failed: ${repairResult.error || '依然としてバリデーションを通過できません'}`);
    }
  }

  const taskId = generateTaskId();
  const snapshotDir = await saveSnapshot(taskId, {
    input: prompt,
    outputRaw: text,
    outputParsed: parsedObject || { error: 'Parse failed', message: error, raw: yamlRaw },
    meta: meta,
  });

  console.log(`\n===== Phase A Output (Parsed) =====`);
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
