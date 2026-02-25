import * as fs from 'fs/promises';
import * as path from 'path';
import { generateContent } from './ai.js';
import { buildPhaseBPrompt } from './prompt.js';
import { saveSnapshot } from './snapshot.js';
import { StepBatch } from './dag.js';
import { exec, execSync } from 'child_process';
import { loadConfig } from './utils/config.js';

/**
 * 指定したテストコマンド（またはデフォルトの npm test）を実行し、その結果を返す。
 * @param workingDir 実行ディレクトリ
 * @param command 実行するテストコマンド (例: 'npm test test/specific.test.ts')
 * @returns Promise<{ stdout: string, stderr: string, code: number | null }> テストの標準出力と標準エラー出力
 */
export function executeTests(workingDir?: string, command?: string): Promise<{ stdout: string, stderr: string, code: number | null }> {
  const testCmd = command || 'npm test';
  return new Promise((resolve, reject) => {
    console.log(`\n--- Running test: ${testCmd} in ${workingDir || 'cwd'} ---`);
    exec(testCmd, { cwd: workingDir || process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Test failed with exit code ${error.code}: ${testCmd}`);
        // エラーが発生した場合も、stdoutとstderrは返す
        resolve({ stdout, stderr, code: error.code ?? null });
      } else {
        console.log(`✅ Test passed: ${testCmd}`);
        resolve({ stdout, stderr, code: 0 });
      }
    });
  });
}

/**
 * 単一の実行ステップを処理し、プロンプト生成・AI呼び出し・スナップショット保存を行う。
 * 実行後に、そのステップ固有のテストがあれば実行する。
 */
export async function executeStep(step: any, cautions: any[], taskId: string, workingDir?: string): Promise<{ text: string, testResult?: any }> {
  console.log(`\n--- Executing Step ${step.id} ---`);
  console.log(`Description: ${step.description}`);
  console.log(`Target Files: ${step.target_files?.join(', ') || 'None'}`);

  const baseDir = workingDir || process.cwd();

  // 対象ファイルの中身をまとめる
  let targetFilesContent = '';
  if (Array.isArray(step.target_files) && step.target_files.length > 0) {
    for (const filepath of step.target_files) {
      let content = '';
      try {
         const absPath = path.resolve(baseDir, filepath);
         content = await fs.readFile(absPath, 'utf-8');
      } catch (e: any) {
         console.warn(`⚠️ Could not read file ${filepath}: ${e.message}`);
         content = '（新規作成）';
      }
      targetFilesContent += `\n### File: ${filepath}\n${content}\n`;
    }
  }

  const prompt = buildPhaseBPrompt(step.description, targetFilesContent, cautions || []);
  const config = await loadConfig();

  console.log(`Sending execution request to lightweight model (${config.ai.flash_model}) for step ${step.id}...`);
  
  const systemInstruction = "あなたは優秀なプログラマーです。プロンプトの指示に厳密に従い、変更後の完全なコードのみを出力してください。Markdownのコードブロック記号は不要です。";
  const { text: rawOutput, meta } = await generateContent(prompt, config.ai.flash_model, systemInstruction);

  // Markdownのコードブロックが含まれている場合は中身を抽出する
  let text = rawOutput;
  const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/g;
  const matches = [...rawOutput.matchAll(codeBlockRegex)];
  if (matches.length > 0) {
    // 最初のコードブロックを採用
    text = matches[0][1].trim();
  } else {
    // コードブロックがない場合、もし先頭か末尾にバッククォートがあれば除去する（極稀なケース）
    text = rawOutput.replace(/^```(?:\w+)?\n/, '').replace(/\n```$/, '').trim();
  }

  await saveSnapshot(taskId, {
    input: prompt,
    outputRaw: rawOutput,
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
      return { text };
    }

    if (step.target_files.length > 1) {
      console.warn(`⚠️ Multiple target files specified for step ${step.id}. Applying changes only to the first file: ${step.target_files[0]}`);
    }

    const targetFile = step.target_files[0];
    try {
      const absPath = path.resolve(baseDir, targetFile);
      // ディレクトリが存在しない場合は作成
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, text, 'utf-8');
      console.log(`✅ Applied changes to: ${targetFile} (in ${baseDir})`);

      // Git リポジトリ内であれば git add を実行する
      try {
        execSync(`git add ${targetFile}`, { cwd: baseDir });
      } catch {
        // Git 管理下でない場合は無視
      }
    } catch (e: any) {
      console.error(`❌ Failed to write file ${targetFile}: ${e.message}`);
    }
  }

  // ステップ固有のテストがある場合は実行する
  let testResult;
  if (step.test_command) {
    console.log(`\n[Step ${step.id}] Running targeted test: ${step.test_command}`);
    testResult = await executeTests(workingDir, step.test_command);

    // テスト失敗時のリトライ (TDD Loop)
    if (testResult.code !== 0) {
      console.log(`\n❌ Step ${step.id} test failed. Attempting self-repair...`);
      const testErrorMessage = `前回のステップで適用したコードにおいて、テスト '${step.test_command}' が失敗しました。以下のエラーメッセージをもとにコードを修正してください:\n${testResult.stderr || testResult.stdout}`;
      const retryCautions = [...cautions, { context: 'Test Failure', instruction: testErrorMessage }];
      
      // 再生成（cautionsにエラーを含める）
      const retryResult = await executeStep({ ...step, test_command: undefined }, retryCautions, taskId, workingDir);
      text = retryResult.text;

      // リトライ後の再テスト
      console.log(`\n[Step ${step.id}] Re-running targeted test after repair: ${step.test_command}`);
      testResult = await executeTests(workingDir, step.test_command);
    }
  }

  return { text, testResult };
}

/**
 * 検証済みのバッチ配列を受け取り、直列（バッチ間）および並列（バッチ内）でタスクを実行する。
 */
export async function executeBatches(batches: StepBatch[], cautions: any[], taskId: string, workingDir?: string): Promise<void> {
  console.log('\nStarting Execution Phase (Phase B)...');
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const stepIds = batch.steps.map(s => s.id).join(', ');
    console.log(`\n📦 Executing Batch ${i + 1}/${batches.length} (Steps: [${stepIds}])`);

    // バッチ内のステップは並列実行
    const executionPromises = batch.steps.map(step => executeStep(step, cautions, taskId, workingDir));
    
    // バッチ内のすべてのステップの実行完了を待機
    await Promise.all(executionPromises);
    
    console.log(`✅ Batch ${i + 1} steps completed.`);

    // バッチ全体の完了後に、全体テスト（リグレッションチェック）を実行する
    console.log(`\n[Batch ${i + 1}] Running regression test...`);
    
    // package.json がある場合のみ npm test を実行する
    let testCmd = 'npm test';
    let shouldRunDefaultTest = true;
    try {
      await fs.access(path.join(workingDir || process.cwd(), 'package.json'));
    } catch {
      shouldRunDefaultTest = false;
    }

    if (!shouldRunDefaultTest) {
      console.log('💡 No package.json found. Skipping default npm test.');
      continue; // 次のバッチへ
    }

    let testResult = await executeTests(workingDir, testCmd);

    if (testResult.code !== 0) {
      console.log(`\n❌ Batch ${i + 1} regression test failed. Attempting batch-level repair...`);
      // バッチ全体での修正が必要な場合、本来は依存関係などを考慮して再計画すべきだが、
      // ここでは簡易的に直前のバッチの全ステップにエラー情報をフィードバックしてリトライする
      const testErrorMessage = `バッチ実行後の全体テスト 'npm test' が失敗しました。このバッチで変更した内容に問題がある可能性があります。以下のエラーを修正してください:\n${testResult.stderr || testResult.stdout}`;
      const retryCautions = [...cautions, { context: 'Regression Failure', instruction: testErrorMessage }];

      const retryExecutionPromises = batch.steps.map(step => executeStep({ ...step, test_command: undefined }, retryCautions, taskId, workingDir));
      await Promise.all(retryExecutionPromises);

      console.log('\n--- Re-running regression test after batch repair ---');
      testResult = await executeTests(workingDir, 'npm test');

      if (testResult.code !== 0) {
        console.error(`❌ Batch ${i + 1} regression test failed even after repair. Halting execution.`);
        throw new Error(`Regression test failed after repair. Details:\n${testResult.stderr || testResult.stdout}`);
      } else {
        console.log(`✅ Batch ${i + 1} regression test passed after repair.`);
      }
    } else {
      console.log(`✅ Batch ${i + 1} regression test passed.`);
    }
  }

  console.log('\nすべてのバッチが正常に実行され、テストを通過しました。');
}