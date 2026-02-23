# AGENTS.md

## プロジェクト概要

Deba は「成長する新人エンジニア」をコンセプトとした AI エージェントの CLI ツール。ユーザーの要望を受け取り、要件定義・実装計画の生成（Phase A）→ コード変更の生成（Phase B）→ フィードバックからの学習（Phase C）を一気通貫で実行する。

## 技術スタック

- **言語**: TypeScript (ESNext, NodeNext modules)
- **ビルド**: `tsc` → `build/` に出力
- **LLM**: `gemini` CLI（`child_process.execFile` 経由で呼び出し。SDK やAPIキーは不使用）
- **依存ライブラリ**: `commander`（CLI）, `yaml`（YAML パース）
- **実行方法**: `npm run deba -- <command>`

## ディレクトリ構成

```
deba/
├── src/                  # TypeScript ソースコード
├── docs/                 # ドキュメント群
│   ├── design/           #   設計書（コンセプト〜詳細設計）
│   ├── plans/            #   計画書（LLM利用計画、開発計画）
│   └── drafts/           #   プロンプトドラフト等
├── brain/                # ローカル学習データ（.gitignore対象）
├── snapshots/            # LLM 入出力スナップショット（.gitignore対象）
└── build/                # コンパイル済み JS（.gitignore対象）
```

## CLI コマンド一覧

| コマンド | 説明 |
|---------|------|
| `deba chat <message>` | 単純なLLMチャット |
| `deba plan <request>` | Phase A: 要件定義と実装計画をYAMLで生成 |
| `deba validate <file>` | Phase A出力のスキーマ/DAG検証 |
| `deba execute --step <id> --plan <file>` | Phase B: 単一ステップのコード生成 |
| `deba run <request>` | Plan → Validate → Execute の一気通貫実行 |
| `deba review <task_id>` | Phase C: フィードバック→エピソード記録→Reflection |
| `deba skills` | 獲得スキル一覧の表示 |
| `deba skills-promote <rule>` | 学びをスキル（意味記憶）に昇格 |

## ビルドと実行

```bash
npm run build          # TypeScript → build/ にコンパイル
npm run deba -- <cmd>  # ビルド＋実行（例: npm run deba -- run "...")
```

## アーキテクチャ上の注意点

- **LLM 呼び出し**: `src/ai.ts` で `gemini` CLI を `execFile` で呼び出す。SDK やAPIキーは使わない。モデル指定は `-m`、プロンプトは `-p` フラグで渡す
- **Phase A のプロンプト**: `docs/drafts/phase_a_prompt_draft.md` をテンプレートとして読み込み、`{{USER_REQUEST}}`, `{{SEMANTIC_MEMORY}}`, `{{RELATED_EPISODES}}` 等のプレースホルダーを動的に置換する
- **バッチ実行**: `dag.ts` が依存グラフからバッチを構築し、`runner.ts` がバッチ間は直列、バッチ内は `Promise.all` で並列実行する
- **スナップショット**: すべてのLLM入出力は `snapshots/task_{id}/` に自動保存される。`deba run` 実行時は `phase_a_*`, `step_N_*` のプレフィックス付きで保存
- **成長サイクル**: `brain/skills/` の内容が Phase A プロンプトの `{{SEMANTIC_MEMORY}}` に自動注入され、過去の学びが新しいタスクに反映される
- **ファイル上書きの安全性**: 現時点では生成されたコードは標準出力とスナップショットに保存するのみで、対象ファイルの自動上書きは行わない

## 設計ドキュメント

### docs/design/ — 設計書

| ファイル | 内容 |
|---------|------|
| `001_concept.md` | システム全体像 |
| `002_v2.md` | 成長メカニズムの初期検討 |
| `003_v3_growth_system.md` | 3層記憶モデル・学習サイクル・信頼レベルの詳細設計 |

### docs/plans/ — 計画書

| ファイル | 内容 |
|---------|------|
| `004_llm_usage_plan.md` | LLM使用計画 v1 |
| `005_llm_usage_plan_v2.md` | LLM使用計画 v2（Phase A/B/C設計、エラーハンドリング） |
| `006_agile_development_plan.md` | スプリント計画（Sprint 0〜6） |

### docs/drafts/ — ドラフト

| ファイル | 内容 |
|---------|------|
| `phase_a_prompt_draft.md` | Phase A統合プロンプトのテンプレート |
