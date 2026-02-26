# AGENTS.md

Deba は「成長する新人エンジニア」をコンセプトとした、要件定義からテスト・学習までを自律的に行う AI エージェント CLI です。

## 技術スタック

- **言語**: TypeScript (NodeNext)
- **テスト**: `vitest`
- **LLM**: `gemini` CLI (JSON プロトコル推奨)

## 開発と実行

- ビルド: `npm run build`
- テスト: `npm test`
- 実行: `npm run deba -- run "要望" --file src/xxx.ts`

### 重要なメンテナンス
- **コマンドの追加/変更**: 新しいコマンドを追加したり仕様を変更した場合は、必ずプロジェクトルートの `SKILL.md` を更新し、`npm run deba -- maintenance setup-skill` を実行して反映させてください。
- **整合性チェック**: `SKILL.md` の内容と実装の整合性は `test/skill_md.test.ts` で検証されます。機能追加時はこのテストも更新してください。

## 開発方針

- **CLI/API 特化**: GUI（Electron等）の開発は行わず、CLIとしての機能性と、堅牢なAPI/モジュール設計に注力します。
- **TDD (Test-Driven Development)**: 新機能の実装やバグ修正は必ずTDDで行います。テストが失敗する状態（RED）を確認してから実装（GREEN）に進むサイクルを徹底してください。
- **自律的学習サイクル**: `deba run` での失敗や修正が必要な場合は、必ず `deba review <task_id>` を実行して Reflection（自己反省）を行い、知見をスキルに昇格させてください。

## 知識と知見の検索

このプロジェクトに関する詳細な設計（Git Worktree 隔離、TDD ループ等）や実装上の注意点（YAML エスケープ等）は、**`semantic-knowledge-repository`** スキルに蓄積されています。

タスクを開始する前に、必ず関連キーワードで知識を検索してください。

```bash
# 検索例
node scripts/search_knowledge.cjs "architecture"
node scripts/search_knowledge.cjs "yaml"
```

詳細なドキュメントは `docs/` ディレクトリを参照してください。
