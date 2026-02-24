import * as fs from 'fs/promises';
import * as path from 'path';
import { generateContent } from './ai.js';
import { buildPhaseBPrompt } from './prompt.js';
import { saveSnapshot } from './snapshot.js';
import { StepBatch } from './dag.js';
import { exec } from 'child_process'; // child_processモジュールをインポート

/**
 * npm test を実行し、その結果を返す。
 * @returns Promise<{ stdout: string, stderr: string, code: number | null }> npm test の標準出力と標準エラー出力
 */
export function executeTests(): Promise<{ stdout: string, stderr: string, code: number | null }> {
  return new Promise((resolve, reject) => {
    console.log('\n--- Running npm test ---');
    exec('npm test', (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ npm test failed with exit code ${error.code}`);
        // エラーが発生した場合も、stdoutとstderrは返す
        resolve({ stdout, stderr, code: error.code ?? null });
      } else {
        console.log('✅ npm test completed successfully.');
        resolve({ stdout, stderr, code: 0 });
      }
    });
  });
}

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

  // --- 実ファイルへの適用 ---
  if (Array.isArray(step.target_files) && step.target_files.length > 0) {
    // AIの回答が AMBIGUITY: で始まる場合は、ファイルへの書き込みをスキップする
    if (text.trim().startsWith('AMBIGUITY:')) {
      console.warn(`⚠️ Skipped applying changes because AI reported ambiguity.`);
      return text;
    }

    const targetFile = step.target_files[0];
    try {
      const absPath = path.resolve(process.cwd(), targetFile);
      // ディレクトリが存在しない場合は作成
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, text, 'utf-8');
      console.log(`✅ Applied changes to: ${targetFile}`);
    } catch (e: any) {
      console.error(`❌ Failed to write file ${targetFile}: ${e.message}`);
    }
  }

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

    // 各バッチ処理の完了後にnpm testを実行する
    let testResult = await executeTests();

    // npm test が失敗した場合、1回だけリトライする
    if (testResult.code !== 0) {
      console.log(`\n❌ バッチ ${i + 1} の後で npm test が失敗しました。一度リトライします...`);
      // エラーメッセージをcautionとしてプロンプトに含める
      const testErrorMessage = `前回の 'npm test' で以下のエラーが発生しました。この問題を修正してください:\n${testResult.stderr}`;
      const retryCautions = [...cautions, testErrorMessage];

      // リトライ用のステップを並列実行
      const retryExecutionPromises = batch.steps.map(step => executeStep(step, retryCautions, taskId));
      await Promise.all(retryExecutionPromises);

      // リトライ後のテスト
      console.log('\n--- リトライ後に npm test を実行 ---');
      testResult = await executeTests();

      if (testResult.code !== 0) {
        console.error(`❌ バッチ ${i + 1} のリトライ後も npm test が失敗しました。実行を中断します。`);
        throw new Error(`npm test がリトライ後も失敗しました。詳細:\n${testResult.stderr}`);
      } else {
        console.log(`✅ バッチ ${i + 1} のリトライ後、npm test が成功しました。`);
      }
    }
  }

  console.log('\nすべてのバッチが正常に実行されました。');
}