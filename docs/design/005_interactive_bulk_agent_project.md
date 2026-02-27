# プロジェクト名： Interactive Bulk Agent (仮)

## ビジョン： 「1枚のチケットで、1時間の重労働を」
GitHub Copilot Premium などの「1リクエスト = 1カウント」という制約を逆手に取り、1つのセッションを長時間維持しながら、対話・実行・検証を繰り返して複数のタスクを完遂する、高効率な自律エージェント。

## コア・コンセプト： Stateful & Interactive Bulk
従来の「投げっぱなし（Stateless）」なエージェントから、コンテキストを保持し続ける「対話型（Stateful）」への転換。

1. **シングルセッション完遂**: 計画生成から実装、テスト修正までを一つの会話コンテキスト（1リクエスト）内で完結させる。
2. **ツール駆動（Tool-use）**: AI自身が `run_test`, `read_file`, `write_file` などのツールを自在に使い、自律的に試行錯誤する。
3. **動的軌道修正（askQuestion）**: 曖昧な点や予期せぬエラーが発生した際、セッションを閉じずにユーザーに質問（`askQuestion`）を投げ、回答を得て作業を続行する。
4. **役割の内部統合**: 一つのプロンプト内で「戦略を立てる軍師」と「手を動かす足軽」を演じ分け、自己レビューを行いながら進む。

## 期待されるアーキテクチャ (Event-Loop Agent)
```typescript
while (session.isActive()) {
  // 1. AIの思考と行動（ツール呼び出し）を受け取る
  const turn = await ai.generateNextTurn(context);

  if (turn.toolCalls.length > 0) {
    for (const call of turn.toolCalls) {
      // 2. ローカル環境でツール（テスト、ファイル操作、質問）を実行
      const result = await dispatcher.execute(call);
      // 3. 実行結果をセッションにフィードバック（リクエストは継続）
      context.addToolResult(result);
    }
  } else if (turn.isTaskCompleted()) {
    session.finish();
  }
}
```

## メリット
- **コスト効率**: プレミアムリクエストの消費を劇的に抑える（10〜20倍の効率化）。
- **成功率の向上**: 途中でユーザーの指示を仰げるため、大規模な変更でも「迷子」にならない。
- **検証の即時性**: テスト結果をその場でAIに返し、パスするまで粘り強く修正させることができる。

## 開発のロードマップ
1. **プロトタイプ**: `askQuestion` と `run_shell` だけを持つ最小構成のチャットループを作成。
2. **隔離環境の統合**: `deba` の Git Worktree 機能を移植し、安全な実験場を確保。
3. **バルク・プランナー**: 複数のタスクを一度に把握し、優先順位をつけて処理する戦略プロンプトの実装。
