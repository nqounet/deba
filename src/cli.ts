#!/usr/bin/env node
import { Command } from 'commander';
import { chatCommand, planCommand } from './commands/plan.js';
import { validateCommand, executeCommand } from './commands/utils.js';
import { runCommand, runPlanCommand } from './commands/run.js';
import { reviewCommand } from './commands/review.js';
import { workerCommand } from './commands/worker.js';
import { cleanCommand, skillsCommand, skillsPromoteCommand, promoteLearningsCommand, consolidateSkillsCommand } from './commands/maintenance.js';
import { worktreeAddCommand } from './commands/worktree.js';

const program = new Command();

program
  .name('deba')
  .description('Deba - AI Agent for Development')
  .version('0.1.0');

program
  .command('chat')
  .description('チャット機能: LLMにプロンプトを送信し結果を表示する')
  .argument('<message>', 'LLMに送信するメッセージ')
  .action(chatCommand);

program
  .command('plan')
  .description('Phase A: ユーザーの要望から要件定義と実装計画を生成する')
  .argument('<request>', '要件定義の元となるユーザーの要望')
  .option('--file <path...>', '入力ファイル (複数指定可)')
  .action(planCommand);

program
  .command('worker')
  .description('キューを監視し、タスクを非同期に実行するワーカーを起動する')
  .action(workerCommand);

program
  .command('worktree-add')
  .description('指定したリポジトリとブランチから、deba内部のworktreesディレクトリにGit Worktreeを作成する')
  .argument('<repo_path>', 'ターゲットリポジトリのパス')
  .argument('<branch_name>', '起点となるブランチ名')
  .option('--name <worktree_name>', '作業ツリー名（オプション）')
  .action(worktreeAddCommand);

program
  .command('validate')
  .description('Phase A の出力(YAML)をパースし、スキーマと依存グラフの検証を行いバッチプランを出力する')
  .argument('<filepath>', '検証するYAMLファイルのパス')
  .action(validateCommand);

program
  .command('execute')
  .description('Phase B: Phase Aの実装計画から指定したステップを実行する (軽量モデルを使用)')
  .requiredOption('--step <id>', '実行するステップのID')
  .requiredOption('--plan <filepath>', 'Phase Aで出力されたYAMLファイル')
  .action(executeCommand);

program
  .command('run')
  .description('Phase A → Verify → Phase B を一気通貫で実行する')
  .argument('<request>', '要件定義の元となるユーザーの要望')
  .option('--file <path...>', '入力ファイル (複数指定可)')
  .action(runCommand);

program
  .command('run-plan')
  .description('外部の計画ファイル(JSON/YAML)を読み込み、直接実行フェーズを開始する (TDDループ付き)')
  .argument('<filepath>', '実行する計画ファイルのパス')
  .action(runPlanCommand);

program
  .command('review')
  .description('Phase C: タスク完了後のフィードバックを受け付け、エピソード記録と学び抽出を行う')
  .argument('<task_id>', 'レビュー対象のタスクID')
  .option('-y, --yes', 'タスクを自動承認し、マージとWorktreeの削除を行う')
  .action(reviewCommand);

const maintenance = program
  .command('maintenance')
  .description('メンテナンスコマンド');

maintenance
  .command('clean')
  .description('不要な Worktree や古いスナップショットを削除して整理する')
  .option('--days <number>', '保持するスナップショットの日数 (デフォルト: 7)', '7')
  .action(cleanCommand);

maintenance
  .command('skills')
  .description('獲得したスキル（意味記憶）の一覧を表示する')
  .action(skillsCommand);

maintenance
  .command('skills-promote')
  .description('学び候補をスキル（意味記憶）に昇格する')
  .argument('<rule>', '昇格するルール文')
  .option('--project <name>', 'プロジェクト名', 'default')
  .action(skillsPromoteCommand);

maintenance
  .command('promote')
  .description('成長ログから学び候補を対話形式でスキルに昇格する')
  .option('-y, --yes', '全ての項目を自動で承認してスキルに昇格する')
  .action(promoteLearningsCommand);

maintenance
  .command('consolidate-skills')
  .description('重複するスキルや冗長なスキルを統合・整理する')
  .action(consolidateSkillsCommand);

program.parse(process.argv);