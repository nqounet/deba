#!/usr/bin/env node
import { Command } from 'commander';
import { generateContent } from './ai.js';
import { saveSnapshot, generateTaskId } from './snapshot.js';
import yaml from 'yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { buildPhaseAPrompt, buildReflectionPrompt } from './prompt.js';
import { extractAndParseYaml } from './yamlParser.js';
import { validatePhaseA } from './validator.js';
import { validateAndBuildBatches } from './dag.js';
import { executeStep, executeBatches } from './runner.js';
import { saveEpisode } from './episode.js';
import { appendGrowthLog } from './growthLog.js';
import { listSkills as listSkillsInfo, promoteToSkill } from './skills.js';

const program = new Command();

program
  .name('deba')
  .description('Deba - AI Agent for Development')
  .version('0.1.0');

program
  .command('chat')
  .description('チャット機能: LLMにプロンプトを送信し結果を表示する')
  .argument('<message>', 'LLMに送信するメッセージ')
  .action(async (message: string) => {
    try {
      console.log(`Sending message to LLM...`);
      const { text, meta } = await generateContent(message);
      
      console.log('\n===== Response =====');
      console.log(text);
      console.log('====================\n');

      const taskId = generateTaskId();
      const snapshotDir = await saveSnapshot(taskId, {
        input: message,
        outputRaw: text,
        meta: meta,
      });

      console.log(`[Snapshot saved to ${snapshotDir}]`);
    } catch (error) {
      console.error('Command execution failed.', error);
      process.exit(1);
    }
  });



program
  .command('plan')
  .description('Phase A: ユーザーの要望から要件定義と実装計画を生成する')
  .argument('<request>', '要件定義の元となるユーザーの要望')
  .action(async (request: string) => {
    try {
      console.log('Building Phase A prompt...');
      const prompt = await buildPhaseAPrompt(request);

      console.log('Sending plan request to LLM...');
      const { text, meta } = await generateContent(prompt);
      
      console.log('Extracting and parsing YAML...');
      const { yamlRaw, parsedObject, error } = extractAndParseYaml(text);

      const taskId = generateTaskId();
      const snapshotDir = await saveSnapshot(taskId, {
        input: prompt,
        outputRaw: text,
        outputParsed: parsedObject || { error: 'Parse failed', message: error, raw: yamlRaw },
        meta: meta,
      });

      console.log('\n===== Phase A Output (Parsed) =====');
      if (parsedObject) {
        console.log(yaml.stringify(parsedObject));
      } else {
        console.error('Parse Error:', error);
      }
      console.log('===================================\n');

      console.log(`[Snapshot saved to ${snapshotDir}]`);
    } catch (error) {
      console.error('Command execution failed.', error);
      process.exit(1);
    }
  });


program
  .command('validate')
  .description('Phase A の出力(YAML)をパースし、スキーマと依存グラフの検証を行いバッチプランを出力する')
  .argument('<filepath>', '検証するYAMLファイルのパス')
  .action(async (filepath: string) => {
    try {
      const fileContent = await fs.readFile(filepath, 'utf-8');
      const parsedData = yaml.parse(fileContent);

      console.log(`\n--- Validating ${filepath} ---`);

      console.log('\n[1] Schema Validation:');
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

      console.log('\n[2] Execution DAG & Batching:');
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

      console.log('------------------------------\n');
      
      // CIなどでの利用のため、エラーがあれば異常終了する
      if (!schemaResult.isValid || (parsedData.implementation_plan?.steps && !validateAndBuildBatches(parsedData.implementation_plan.steps).isValid)) {
        process.exit(1);
      }

    } catch (error) {
      console.error('Error validating file:', error);
      process.exit(1);
    }
  });


program
  .command('execute')
  .description('Phase B: Phase Aの実装計画から指定したステップを実行する (軽量モデルを使用)')
  .requiredOption('--step <id>', '実行するステップのID')
  .requiredOption('--plan <filepath>', 'Phase Aで出力されたYAMLファイル (例: snapshots/.../output_parsed.yml)')
  .action(async (options) => {
    try {
      const { step, plan } = options;
      console.log(`Loading plan from: ${plan}`);
      
      const fileContent = await fs.readFile(plan, 'utf-8');
      const parsedData = yaml.parse(fileContent);

      const steps = parsedData.implementation_plan?.steps;
      if (!Array.isArray(steps)) {
        throw new Error('Invalid plan format: "implementation_plan.steps" is missing or not an array.');
      }

      // 該当ステップを検索
      // step.id は number または string になり得るため、文字列比較で行う
      const targetStep = steps.find((s: any) => String(s.id) === String(step));
      if (!targetStep) {
        throw new Error(`Step ID "${step}" not found in the plan.`);
      }

      const cautions = parsedData.cautions || [];
      const taskId = generateTaskId(); // execute単発実行用の一時ID

      await executeStep(targetStep, cautions, taskId);

      console.log(`✅ Note: By default in Sprint 3, files are not automatically overwritten for safety.`);
      console.log(`[Snapshot saved to snapshots/${taskId}]`);

    } catch (error) {
       console.error('Command execution failed.', error);
       process.exit(1);
    }
  });



program
  .command('run')
  .description('Phase A → Verify → Phase B を一気通貫で実行する')
  .argument('<request>', '要件定義の元となるユーザーの要望')
  .action(async (request: string) => {
    try {
      const taskId = generateTaskId();
      console.log(`\nStarting Run Task: ${taskId}`);

      // 意味記憶（スキル）の活用インジケーター
      const { count: skillCount } = await listSkillsInfo();
      if (skillCount > 0) {
        console.log(`💡 過去の学びを活用しています (${skillCount}件のスキル)`);
      }

      console.log('\n--- Phase A (Plan) ---');
      const prompt = await buildPhaseAPrompt(request);
      
      console.log('Sending plan request to LLM (gemini-2.5-flash)...');
      const { text, meta } = await generateContent(prompt);
      
      console.log('Extracting and parsing YAML...');
      const { yamlRaw, parsedObject, error } = extractAndParseYaml(text);

      const snapshotDir = await saveSnapshot(taskId, {
         input: prompt,
         outputRaw: text,
         outputParsed: parsedObject || { error: 'Parse failed', message: error, raw: yamlRaw },
         meta: meta,
      }, 'phase_a');

      if (!parsedObject || error) {
        throw new Error(`YAML parsing failed: ${error}`);
      }
      
      console.log('\n--- Validate ---');
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
      await executeBatches(dagResult.batches, cautions, taskId);

      console.log(`\n🎉 Task ${taskId} completed successfully!`);
      console.log(`✅ Note: By default in Sprint 4, files are not automatically overwritten for safety.`);
      console.log(`Check ${snapshotDir} for inputs/outputs.`);
    } catch (error) {
      console.error('Run command failed.', error);
      process.exit(1);
    }
  });



function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

program
  .command('review')
  .description('Phase C: タスク完了後のフィードバックを受け付け、エピソード記録と学び抽出を行う')
  .argument('<task_id>', 'レビュー対象のタスクID (例: task_20260223_020223)')
  .action(async (taskId: string) => {
    try {
      const snapshotDir = path.join(process.cwd(), 'snapshots', taskId);

      // スナップショットディレクトリの存在チェック
      try {
        await fs.access(snapshotDir);
      } catch {
        throw new Error(`Snapshot directory not found: ${snapshotDir}`);
      }

      // Phase Aの入力（ユーザーの元の要望）を取得
      let originalRequest = '(不明)';
      try {
        // run コマンドの場合は phase_a_input.md がある
        const phaseAInput = await fs.readFile(path.join(snapshotDir, 'phase_a_input.md'), 'utf-8');
        // プロンプト全文の中からユーザー要望を抽出（最初の数行）
        originalRequest = phaseAInput.substring(0, 200) + '...';
      } catch {
        try {
          const input = await fs.readFile(path.join(snapshotDir, 'input.md'), 'utf-8');
          originalRequest = input.substring(0, 200) + '...';
        } catch {
          // 見つからない場合はデフォルトのまま
        }
      }

      // 実行されたステップのリストを取得
      const files = await fs.readdir(snapshotDir);
      const stepFiles = files.filter(f => f.startsWith('step_') && f.endsWith('_output_raw.txt'));
      const stepsExecuted = stepFiles.map(f => {
        const match = f.match(/step_(\d+)_output_raw\.txt/);
        return match ? `Step ${match[1]}` : f;
      });

      console.log(`\n--- Review Task: ${taskId} ---`);
      console.log(`Steps executed: ${stepsExecuted.join(', ') || 'N/A'}`);
      console.log(`\nCheck snapshots/${taskId}/ for detailed inputs/outputs.\n`);

      const answer = await askQuestion('承認しますか？ [y/修正内容を入力]: ');

      const isApproved = answer.trim().toLowerCase() === 'y';

      // エピソード記録の保存
      const episodePath = await saveEpisode({
        taskId,
        request: originalRequest,
        stepsExecuted,
        userFeedback: isApproved ? 'approved' : answer.trim(),
        success: isApproved,
      });

      if (isApproved) {
        console.log('\n✅ タスクを承認しました。エピソードを記録し、完了です。');
      } else {
        console.log('\n🔄 修正内容を受け付けました。Reflection を実行します...');

        // エピソードのサマリーを構築
        const episodeSummary = `タスクID: ${taskId}\nユーザー要望: ${originalRequest}\n実行ステップ: ${stepsExecuted.join(', ')}`;

        // 既存スキルの読み込み（存在すれば）
        let currentSkills = '';
        try {
          const skillsDir = path.join(process.cwd(), 'brain', 'skills');
          const skillFiles = await fs.readdir(skillsDir);
          for (const sf of skillFiles) {
            if (sf.endsWith('.md')) {
              const content = await fs.readFile(path.join(skillsDir, sf), 'utf-8');
              currentSkills += `\n### ${sf}\n${content}\n`;
            }
          }
        } catch {
          // スキルがまだない場合
        }

        const reflectionPrompt = buildReflectionPrompt(episodeSummary, answer.trim(), currentSkills);

        console.log('Sending Reflection request to LLM...');
        const systemInstruction = "あなたは自己評価を行う新人エンジニアです。指示に従い、YAML形式のみで出力してください。";
        const { text: reflectionText, meta } = await generateContent(reflectionPrompt, 'gemini-2.5-flash', systemInstruction);

        // スナップショット保存
        await saveSnapshot(taskId, {
          input: reflectionPrompt,
          outputRaw: reflectionText,
          meta,
        }, 'reflection');

        // Reflection結果をパース
        const { parsedObject } = extractAndParseYaml(reflectionText);

        if (parsedObject) {
          console.log('\n===== Reflection Result =====');
          console.log(yaml.stringify(parsedObject));
          console.log('=============================\n');

          // 学び候補を成長ログに追記
          const learnings = parsedObject.learnings || [];
          for (const learning of learnings) {
            await appendGrowthLog({
              summary: learning.summary || '(要約なし)',
              generalizability: learning.generalizability || 'medium',
              relatedSkills: learning.related_skills || 'new',
              proposedRule: learning.proposed_rule,
              sourceEpisode: episodePath,
            });
          }

          // 自己評価をエピソードに追記
          if (parsedObject.reflection?.self_assessment) {
            console.log(`💭 自己評価: ${parsedObject.reflection.self_assessment}`);
          }
        } else {
          console.warn('⚠️ Reflection output could not be parsed as YAML.');
          console.log('Raw output:', reflectionText);
        }

        console.log('\n✅ Reflection完了。学び候補が成長ログに追記されました。');
      }

    } catch (error) {
      console.error('Review command failed.', error);
      process.exit(1);
    }
  });


program
  .command('skills')
  .description('獲得したスキル（意味記憶）の一覧を表示する')
  .action(async () => {
    try {
      const { display } = await listSkillsInfo();
      console.log('\n' + display + '\n');
    } catch (error) {
      console.error('Skills command failed.', error);
      process.exit(1);
    }
  });

program
  .command('skills-promote')
  .description('学び候補をスキル（意味記憶）に昇格する')
  .argument('<rule>', '昇格するルール文')
  .option('--project <name>', 'プロジェクト名', 'default')
  .action(async (rule: string, options: { project: string }) => {
    try {
      await promoteToSkill(rule, options.project);
      console.log(`✅ スキルに昇格しました: ${rule}`);
    } catch (error) {
      console.error('Skills promote failed.', error);
      process.exit(1);
    }
  });

program.parse(process.argv);
