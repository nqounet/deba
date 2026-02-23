import * as fs from 'fs/promises';
import * as path from 'path';
import { generateContent } from './ai.js';
import { buildPhaseBPrompt } from './prompt.js';
import { saveSnapshot } from './snapshot.js';
import { StepBatch } from './dag.js';

/**
 * 単一の実行ステップを処理し、プロンプト生成・AI呼び出し・スナップショット保存を行う。
 */
export async function executeStep(step: any, cautions: any[], taskId: string): Promise<string> {
  console.log(`\n--- Executing Step ${step.id} ---`);
  console.log(`Description: ${step.description}`);
  console.log(`Target Files: ${step.target_files?.join(', ') || 'None'}`);

  // 対象ファイルの中身をまとめる
  let targetFilesContent = '';
  if (Array.isArray(step.target_files) && step.target_files.length > 0) {
    for (const filepath of step.target_files) {
      let content = '';
      try {
         const absPath = path.resolve(process.cwd(), filepath);
         content = await fs.readFile(absPath, 'utf-8');
      } catch (e: any) {
         console.warn(`⚠️ Could not read file ${filepath}: ${e.message}`);
         content = '（新規作成）';
      }
      targetFilesContent += `\n### File: ${filepath}\n${content}\n`;
    }
  }

  const prompt = buildPhaseBPrompt(step.description, targetFilesContent, cautions || []);

  console.log(`Sending execution request to lightweight model (gemini-2.5-flash) for step ${step.id}...`);
  
  const systemInstruction = "あなたは優秀なプログラマーです。プロンプトの指示に厳密に従い、変更後の完全なコードのみを出力してください。Markdownのコードブロック記号は不要です。";
  const { text, meta } = await generateContent(prompt, 'gemini-2.5-flash', systemInstruction);

  await saveSnapshot(taskId, {
    input: prompt,
    outputRaw: text,
    meta: meta,
  }, `step_${step.id}`);

  console.log(`\n===== Step ${step.id} Output (Code Change) =====`);
  console.log(text);
  console.log(`=========================================\n`);

  return text;
}

/**
 * 検証済みのバッチ配列を受け取り、直列（バッチ間）および並列（バッチ内）でタスクを実行する。
 */
export async function executeBatches(batches: StepBatch[], cautions: any[], taskId: string): Promise<void> {
  console.log('\nStarting Execution Phase (Phase B)...');
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const stepIds = batch.steps.map(s => s.id).join(', ');
    console.log(`\n📦 Executing Batch ${i + 1}/${batches.length} (Steps: [${stepIds}])`);

    // バッチ内のステップは並列実行（parallelizable が有効に働く）
    // Promise.all で全て同時に走らせ、全完了を待つ
    const executionPromises = batch.steps.map(step => executeStep(step, cautions, taskId));
    
    // バッチ内のすべてのステップの実行完了を待機
    await Promise.all(executionPromises);
    
    console.log(`✅ Batch ${i + 1} completed.`);
  }

  console.log('\nAll batches successfully executed.');
}
