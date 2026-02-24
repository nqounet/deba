import * as fs from 'fs/promises';
import yaml from 'yaml';
import { validatePhaseA } from '../validator.js';
import { validateAndBuildBatches } from '../dag.js';
import { executeStep } from '../runner.js';
import { generateTaskId } from '../snapshot.js';

export async function validateCommand(filepath: string) {
  const fileContent = await fs.readFile(filepath, 'utf-8');
  const parsedData = yaml.parse(fileContent);

  console.log(`\n--- Validating ${filepath} ---`);

  console.log(`\n[1] Schema Validation:`);
  const schemaResult = validatePhaseA(parsedData);
  if (!schemaResult.isValid) {
    console.error('❌ Schema validation failed with errors:');
    schemaResult.errors.forEach(e => console.error(`  - ${e}`));
  } else {
    console.log('✅ Schema is valid.');
  }
  if (schemaResult.warnings.length > 0) {
    console.warn('⚠️ Warnings:');
    schemaResult.warnings.forEach(w => console.warn(`  - ${w}`));
  }

  console.log(`\n[2] Execution DAG & Batching:`);
  if (parsedData.implementation_plan && Array.isArray(parsedData.implementation_plan.steps)) {
     const dagResult = validateAndBuildBatches(parsedData.implementation_plan.steps);
     if (!dagResult.isValid) {
       console.error('❌ DAG validation failed with errors:');
       dagResult.errors.forEach(e => console.error(`  - ${e}`));
     } else {
       console.log('✅ DAG is valid. No circular dependencies.');
       console.log(`\n📦 Constructed ${dagResult.batches.length} Execution Batches:`);
       dagResult.batches.forEach((batch, idx) => {
         const stepIds = batch.steps.map(s => s.id).join(', ');
         const isExclusive = batch.steps.length === 1 && batch.steps[0].parallelizable === false;
         console.log(`  Batch ${idx + 1}: Steps [${stepIds}] ${isExclusive ? '(Exclusive)' : '(Parallel)'}`);
       });
     }
  } else {
     console.error('❌ Cannot build DAG because implementation_plan.steps is missing or invalid.');
  }

  console.log(`------------------------------\n`);
  
  if (!schemaResult.isValid || (parsedData.implementation_plan?.steps && !validateAndBuildBatches(parsedData.implementation_plan.steps).isValid)) {
    process.exit(1);
  }
}

export async function executeCommand(options: { step: string, plan: string }) {
  const { step, plan } = options;
  console.log(`Loading plan from: ${plan}`);
  
  const fileContent = await fs.readFile(plan, 'utf-8');
  const parsedData = yaml.parse(fileContent);

  const steps = parsedData.implementation_plan?.steps;
  if (!Array.isArray(steps)) {
    throw new Error('Invalid plan format: "implementation_plan.steps" is missing or not an array.');
  }

  const targetStep = steps.find((s: any) => String(s.id) === String(step));
  if (!targetStep) {
    throw new Error(`Step ID "${step}" not found in the plan.`);
  }

  const cautions = parsedData.cautions || [];
  const taskId = generateTaskId(); 

  await executeStep(targetStep, cautions, taskId);
  console.log(`[Snapshot saved to snapshots/${taskId}]`);
}
