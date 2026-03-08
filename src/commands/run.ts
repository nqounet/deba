import * as fs from 'fs/promises';
import yaml from 'yaml';
import { generateContent } from '../ai.js';
import { saveSnapshot, generateTaskId } from '../snapshot.js';
import { buildPhaseAPrompt, buildRepairPrompt } from '../prompt.js';
import { extractAndParseYaml } from '../yamlParser.js';
import { validatePhaseA } from '../validator.js';
import { validateAndBuildBatches } from '../dag.js';
import { executeBatches } from '../runner.js';
import { listSkills as listSkillsInfo } from '../skills.js';
import { createWorktree } from '../utils/git.js';
import { moveAllSteps } from '../utils/queue.js';
import { loadConfig } from '../utils/config.js';

export async function runCommand(request: string, options: { file?: string[] }) {
  const taskId = generateTaskId();
  console.log(`\nStarting Run Task: ${taskId}`);

  const { count: skillCount } = await listSkillsInfo();
  if (skillCount > 0) {
    console.log(`💡 過去の学びを活用しています (${skillCount}件のスキル)`);
  }

  console.log(`\n--- Phase A (Plan) ---`);
  const prompt = await buildPhaseAPrompt(request, options.file);
  const config = await loadConfig();
  
  const { text, meta } = await generateContent(prompt, config.ai.execution);
  
  console.log('Extracting and parsing YAML...');
  let { yamlRaw, parsedObject, error } = extractAndParseYaml(text);

  const needsRepair = error || !parsedObject || typeof parsedObject !== 'object' || !validatePhaseA(parsedObject).isValid;
  
  if (needsRepair) {
    const errorDetail = error || (parsedObject && typeof parsedObject === 'object' ? validatePhaseA(parsedObject).errors.join(', ') : '出力が正しいオブジェクト形式ではありません');
    console.warn(`⚠️ YAML/JSON validation/parse error: ${errorDetail}`);
    console.log('Attempting self-healing (retry 1/1)...');
    
    const repairPrompt = await buildRepairPrompt(errorDetail);
    const { text: repairedText } = await generateContent(repairPrompt, config.ai.execution);
    
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

  try {
    await executeBatches(dagResult.batches, cautions, taskId, worktreeDir);
    await moveAllSteps(taskId, 'todo', 'done');
  } catch (error) {
    await moveAllSteps(taskId, 'todo', 'failed');
    throw error;
  }

  console.log(`\n🎉 Task ${taskId} completed successfully in worktree!`);
  console.log(`\n👉 次に、以下のコマンドを実行してレビューを行い、学びを記録してください：`);
  console.log(`   npm run deba -- review ${taskId}`);
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

  // スナップショットパスから元の taskId を抽出（キューの移動用）
  const originalTaskIdMatch = filepath.match(/task_\d+_\d+_[a-f0-9]+/);
  const originalTaskId = originalTaskIdMatch ? originalTaskIdMatch[0] : taskId;

  try {
    await executeBatches(dagResult.batches, cautions, taskId, worktreeDir);
    await moveAllSteps(originalTaskId, 'todo', 'done');
  } catch (error) {
    await moveAllSteps(originalTaskId, 'todo', 'failed');
    throw error;
  }

  console.log(`\n🎉 Task ${taskId} completed successfully in worktree!`);
  console.log(`\n👉 次に、以下のコマンドを実行してレビューを行い、学びを記録してください：`);
  console.log(`   npm run deba -- review ${taskId}`);
}
