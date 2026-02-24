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

## 知識と知見の検索

このプロジェクトに関する詳細な設計（Git Worktree 隔離、TDD ループ等）や実装上の注意点（YAML エスケープ等）は、**`semantic-knowledge-repository`** スキルに蓄積されています。

タスクを開始する前に、必ず関連キーワードで知識を検索してください。

```bash
# 検索例
node scripts/search_knowledge.cjs "architecture"
node scripts/search_knowledge.cjs "yaml"
```

詳細なドキュメントは `docs/` ディレクトリを参照してください。
