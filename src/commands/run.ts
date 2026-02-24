import * as fs from 'fs/promises';
import yaml from 'yaml';
import { generateContent } from '../ai.js';
import { saveSnapshot, generateTaskId } from '../snapshot.js';
import { buildPhaseAPrompt } from '../prompt.js';
import { extractAndParseYaml } from '../yamlParser.js';
import { validatePhaseA } from '../validator.js';
import { validateAndBuildBatches } from '../dag.js';
import { executeBatches } from '../runner.js';
import { listSkills as listSkillsInfo } from '../skills.js';
import { createWorktree } from '../utils/git.js';

export async function runCommand(request: string, options: { file?: string[] }) {
  const taskId = generateTaskId();
  console.log(`\nStarting Run Task: ${taskId}`);

  const { count: skillCount } = await listSkillsInfo();
  if (skillCount > 0) {
    console.log(`💡 過去の学びを活用しています (${skillCount}件のスキル)`);
  }

  console.log(`\n--- Phase A (Plan) ---`);
  const prompt = await buildPhaseAPrompt(request, options.file);
  
  console.log('Sending plan request to LLM (gemini-2.5-pro)...');
  const { text, meta } = await generateContent(prompt, 'gemini-2.5-pro');
  
  console.log('Extracting and parsing YAML...');
  let { yamlRaw, parsedObject, error } = extractAndParseYaml(text);

  const needsRepair = error || !parsedObject || typeof parsedObject !== 'object' || !validatePhaseA(parsedObject).isValid;
  
  if (needsRepair) {
    const errorDetail = error || (parsedObject && typeof parsedObject === 'object' ? validatePhaseA(parsedObject).errors.join(', ') : '出力が正しいオブジェクト形式ではありません');
    console.warn(`⚠️ YAML/JSON validation/parse error: ${errorDetail}`);
    console.log('Attempting self-healing (retry 1/1)...');
    
    const repairPrompt = `先ほど出力された内容に不備がありました。\nエラー詳細: ${errorDetail}\n\n不足している情報を補完し、validなJSONブロックのみを再出力してください。特に閉じクォートやカンマ、インデント、必須フィールドの有無に注意してください。前置きは不要です。`;
    const { text: repairedText } = await generateContent(repairPrompt, 'gemini-2.5-pro');
    
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

  const snapshotDir = await saveSnapshot(taskId, {
     input: prompt,
     outputRaw: text,
     outputParsed: parsedObject || { error: 'Parse failed', message: error, raw: yamlRaw },
     meta: meta,
  }, 'phase_a');

  if (!parsedObject || error) {
    throw new Error(`YAML parsing failed: ${error}`);
  }
  
  console.log(`\n--- Validate ---`);
  const schemaResult = validatePhaseA(parsedObject);
  if (!schemaResult.isValid) {
     throw new Error(`Schema validation failed:\n  ${schemaResult.errors.join('\n  ')}`);
  }

  const steps = parsedObject.implementation_plan?.steps || [];
  const dagResult = validateAndBuildBatches(steps);
  if (!dagResult.isValid) {
     throw new Error(`DAG validation failed:\n  ${dagResult.errors.join('\n  ')}`);
  }

  console.log(`✅ Validation passed. ${dagResult.batches.length} Execution Batches constructed.`);

  const cautions = parsedObject.cautions || [];
  const worktreeDir = createWorktree(taskId);
  console.log(`🚀 Isolated execution in worktree: ${worktreeDir}`);

  await executeBatches(dagResult.batches, cautions, taskId, worktreeDir);

  console.log(`\n🎉 Task ${taskId} completed successfully in worktree!`);
}

export async function runPlanCommand(filepath: string) {
  const taskId = generateTaskId();
  console.log(`\nStarting Run-Plan Task: ${taskId}`);
  console.log(`Loading plan from: ${filepath}`);
  
  const fileContent = await fs.readFile(filepath, 'utf-8');
  const parsedData = yaml.parse(fileContent);

  console.log(`\n--- Validate ---`);
  const schemaResult = validatePhaseA(parsedData);
  if (!schemaResult.isValid) {
     throw new Error(`Schema validation failed:\n  ${schemaResult.errors.join('\n  ')}`);
  }

  const steps = parsedData.implementation_plan?.steps || [];
  const dagResult = validateAndBuildBatches(steps);
  if (!dagResult.isValid) {
     throw new Error(`DAG validation failed:\n  ${dagResult.errors.join('\n  ')}`);
  }

  console.log(`✅ Validation passed. ${dagResult.batches.length} Execution Batches constructed.`);

  const cautions = parsedData.cautions || [];
  const worktreeDir = createWorktree(taskId);
  console.log(`🚀 Isolated execution in worktree: ${worktreeDir}`);

  await executeBatches(dagResult.batches, cautions, taskId, worktreeDir);

  console.log(`\n🎉 Task ${taskId} completed successfully in worktree!`);
}
