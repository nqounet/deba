import * as fs from 'fs/promises';
import yaml from 'yaml';
import { generateTaskId } from '../snapshot.js';
import { validatePlanning } from '../validator.js';
import { validateAndBuildBatches } from '../dag.js';
import { executeBatches } from '../runner.js';
import { listSkills as listSkillsInfo } from '../skills.js';
import { createWorktree } from '../utils/git-worktree.js';
import { moveAllSteps } from '../utils/queue.js';
import { loadConfig } from '../utils/config.js';
import { executePlanning } from '../services/planning.js';

export async function runCommand(request: string, options: { file?: string[] }) {
  const taskId = generateTaskId();
  console.log(`\nStarting Run Task: ${taskId}`);

  const { count: skillCount } = await listSkillsInfo();
  if (skillCount > 0) {
    console.log(`💡 過去の学びを活用しています (${skillCount}件のスキル)`);
  }

  console.log(`\n--- Planning (Plan) ---`);
  const config = await loadConfig();
  const { parsedObject, error } = await executePlanning(taskId, request, options);

  if (!parsedObject || error) {
    throw new Error(`YAML parsing failed: ${error}`);
  }
  
  console.log(`\n--- Validate ---`);
  const schemaResult = validatePlanning(parsedObject);
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
  const schemaResult = validatePlanning(parsedData);
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
