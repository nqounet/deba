import * as fs from 'fs/promises';
import * as path from 'path';
import { generateContent } from './ai.js';
import { buildExecutionPrompt } from './prompt.js';
import { saveSnapshot } from './snapshot.js';
import { StepBatch } from './dag.js';
import { spawn } from 'child_process';
import { loadConfig } from './utils/config.js';
import { spinner } from './utils/spinner.js';
import { parseCodeBlocks } from './utils/parser.js';
import { applyFileChange } from './utils/fs.js';
import { sanitizeTestCommand } from './utils/sanitize.js';

/**
 * 指定したテストコマンド（またはデフォルトの npm test）を実行し、その結果を返す。
 * @param workingDir 実行ディレクトリ
 * @param command 実行するテストコマンド (例: 'npm test test/specific.test.ts')
 * @returns Promise<{ stdout: string, stderr: string, code: number | null }> テストの標準出力と標準エラー出力
 */
export function executeTests(workingDir?: string, command?: string): Promise<{ stdout: string, stderr: string, code: number | null }> {
  let testCmd = command || 'npm test';
  
  try {
    testCmd = sanitizeTestCommand(testCmd);
  } catch (e: any) {
    spinner.fail(`Test validation failed: ${e.message}`);
    return Promise.resolve({ stdout: '', stderr: e.message, code: 1 });
  }

  spinner.start(`Running test: ${testCmd}...`);
  
  return new Promise((resolve) => {
    const args = testCmd.split(/\s+/);
    const cmd = args.shift()!;

    const child = spawn(cmd, args, { cwd: workingDir || process.cwd(), shell: process.platform === 'win32' });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      spinner.fail(`Test failed: ${testCmd} (${error.message})`);
      resolve({ stdout, stderr: stderr + error.message, code: 1 });
    });

    child.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      if (code === 0) {
        spinner.succeed(`Test passed: ${testCmd}`);
      } else {
        spinner.fail(`Test failed: ${testCmd}`);
      }
      resolve({ stdout, stderr, code });
    });
  });
}

/**
 * 単一の実行ステップを処理し、プロンプト生成・AI呼び出し・スナップショット保存を行う。
 * 実行後に、そのステップ固有のテストがあれば実行する。
 */
export async function executeStep(step: any, cautions: any[], taskId: string, workingDir?: string, retryCount = 0): Promise<{ text: string, success: boolean, testResult?: any }> {
  const MAX_RETRIES = 3;
  console.log(`\n--- Executing Step ${step.id} (Retry: ${retryCount}/${MAX_RETRIES}) ---`);
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
      } catch (e: unknown) {
         const message = e instanceof Error ? e.message : String(e);
         console.warn(`⚠️ Could not read file ${filepath}: ${message}`);
         content = '（新規作成）';
      }
      targetFilesContent += `\n### File: ${filepath}\n${content}\n`;
    }
  }

  const prompt = await buildExecutionPrompt(step.description, targetFilesContent, cautions || []);
  const config = await loadConfig();

  const systemInstruction = "あなたは優秀なプログラマーです。プロンプトの指示に厳密に従い、変更後の完全なコードを Markdown のコードブロック形式で出力してください。";
  const { text: rawOutput, meta } = await generateContent(prompt, config.ai.execution, systemInstruction, { silent: true });

  await saveSnapshot(taskId, {
    input: prompt,
    outputRaw: rawOutput,
    meta: meta,
  }, `step_${step.id}`);

  console.log(`\n===== Step ${step.id} Output (Code Changes Parsed) =====`);

  // AIの回答が AMBIGUITY: で始まる場合は、実行を中断する
  if (rawOutput.trim().startsWith('AMBIGUITY:')) {
    console.warn(`⚠️ Skipped applying changes because AI reported ambiguity.`);
    return { text: rawOutput, success: false };
  }

  // --- AIの回答から複数ファイルのコードブロックを抽出・パース ---
  const fileChanges = parseCodeBlocks(rawOutput, step.target_files);

  if (fileChanges.length === 0 && Array.isArray(step.target_files) && step.target_files.length > 0) {
    console.warn(`⚠️ No code changes detected in AI output for Step ${step.id}.`);
  }

  // --- 実ファイルへの適用 ---
  for (const change of fileChanges) {
    try {
      await applyFileChange(baseDir, change.path, change.content);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`❌ Failed to write file ${change.path}: ${message}`);
    }
  }

  // 互換性のための text 変数（最初の変更内容をセット）
  let text = fileChanges.length > 0 ? fileChanges[0].content : rawOutput;

  // ステップ固有のテストがある場合は実行する
  let testResult;
  if (step.test_command) {
    console.log(`\n[Step ${step.id}] Running targeted test: ${step.test_command}`);
    testResult = await executeTests(workingDir, step.test_command);

    // テスト失敗時のリトライ (TDD Loop)
    if (testResult.code !== 0) {
      if (retryCount >= MAX_RETRIES) {
        const detail = testResult.stderr || testResult.stdout;
        console.error(`\n❌ Step ${step.id} test failed and max retries (${MAX_RETRIES}) reached. Halting.`);
        throw new Error(`Step ${step.id} test failed after ${MAX_RETRIES} retries.\nDetails:\n${detail}`);
      }
      
      console.log(`\n❌ Step ${step.id} test failed. Attempting self-repair (Attempt ${retryCount + 1}/${MAX_RETRIES})...`);
      
      const rawError = testResult.stderr || testResult.stdout;
      const truncatedError = rawError.length > 2000 ? rawError.substring(0, 1000) + '\n...[truncated]...\n' + rawError.substring(rawError.length - 1000) : rawError;
      const testErrorMessage = `前回のステップで適用したコードにおいて、テスト '${step.test_command}' が失敗しました。以下のエラーメッセージをもとにコードを修正してください:\n${truncatedError}`;
      
      // Prevent context explosion by keeping only original cautions (filtering out previous test failures)
      const filteredCautions = cautions.filter((c: any) => c.context !== 'Test Failure');
      const retryCautions = [...filteredCautions, { context: 'Test Failure', instruction: testErrorMessage }];
      
      // 再生成（cautionsにエラーを含める）
      const retryResult = await executeStep({ ...step, test_command: undefined }, retryCautions, taskId, workingDir, retryCount + 1);
      text = retryResult.text;

      // リトライ後の再テスト
      console.log(`\n[Step ${step.id}] Re-running targeted test after repair: ${step.test_command}`);
      testResult = await executeTests(workingDir, step.test_command);

      if (testResult.code !== 0) {
        return { text, success: false, testResult };
      }
    }
  }

  return { text, success: true, testResult };
}

/**
 * 検証済みのバッチ配列を受け取り、直列（バッチ間）および並列（バッチ内）でタスクを実行する。
 */
export async function executeBatches(batches: StepBatch[], cautions: any[], taskId: string, workingDir?: string): Promise<void> {
  console.log('\nStarting Execution...');
  const completedStepIds = new Set<number>();
  const allStepIds = new Set<number>();
  batches.forEach(b => b.steps.forEach(s => allStepIds.add(s.id)));
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const stepIds = batch.steps.map(s => s.id).join(', ');
    spinner.start(`Executing Batch ${i + 1}/${batches.length} (Steps: [${stepIds}])...`);

    try {
      // バッチ内のステップをフィルタリング：依存関係がすべて完了しているもののみ実行
      const executableSteps = batch.steps.filter(step => {
        const deps = step.dependencies || [];
        const unmetDeps = deps.filter((d: number) => !completedStepIds.has(d));
        if (unmetDeps.length > 0) {
          console.warn(`\n⚠️ Skipping Step ${step.id} because dependencies are not met: [${unmetDeps.join(', ')}]`);
          return false;
        }
        return true;
      });

      if (executableSteps.length === 0) {
        spinner.warn(`Batch ${i + 1} has no executable steps due to unmet dependencies.`);
        continue;
      }

      // バッチ内のステップは並列実行
      const executionPromises = executableSteps.map(async (step) => {
        const result = await executeStep(step, cautions, taskId, workingDir);
        if (result.success) {
          completedStepIds.add(step.id);
        } else {
          console.warn(`\n⚠️ Step ${step.id} completed with success=false (e.g., AMBIGUITY).`);
        }
      });
      
      // バッチ内のすべてのステップの実行完了を待機 (並列実行時のエラー耐性向上)
      const results = await Promise.allSettled(executionPromises);
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      if (failures.length > 0) {
        spinner.fail(`Batch ${i + 1} execution failed.`);
        throw new Error(`Batch ${i + 1} execution failed with ${failures.length} errors. First error: ${failures[0].reason}`);
      }
      spinner.succeed(`Batch ${i + 1} steps processed.`);
    } catch (error) {
      spinner.fail(`Batch ${i + 1} execution failed.`);
      throw error;
    }

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
      
      const rawError = testResult.stderr || testResult.stdout;
      const truncatedError = rawError.length > 2000 ? rawError.substring(0, 1000) + '\n...[truncated]...\n' + rawError.substring(rawError.length - 1000) : rawError;
      
      const testErrorMessage = `バッチ実行後の全体テスト 'npm test' が失敗しました。このバッチで変更した内容に問題がある可能性があります。以下のエラーを修正してください:\n${truncatedError}`;
      
      const filteredCautions = cautions.filter((c: any) => c.context !== 'Regression Failure');
      const retryCautions = [...filteredCautions, { context: 'Regression Failure', instruction: testErrorMessage }];

      const retryExecutionPromises = batch.steps.map(async step => {
        const result = await executeStep({ ...step, test_command: undefined }, retryCautions, taskId, workingDir, 1);
        if (!result.success) {
          console.warn(`\n⚠️ Retry Step ${step.id} completed with success=false.`);
        }
      });
      const retryResults = await Promise.allSettled(retryExecutionPromises);
      const retryFailures = retryResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      if (retryFailures.length > 0) {
        throw new Error(`Batch ${i + 1} retry failed with ${retryFailures.length} errors. First error: ${retryFailures[0].reason}`);
      }

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

  const successCount = completedStepIds.size;
  const totalCount = allStepIds.size;

  if (successCount === totalCount) {
    console.log('\n🎉 すべてのステップが正常に実行され、テストを通過しました。');
  } else {
    console.log(`\n⚠️ 実行完了: ${successCount} ステップ成功 / ${totalCount} ステップ中 (${totalCount - successCount} ステップがスキップまたは未完了)`);
  }
}