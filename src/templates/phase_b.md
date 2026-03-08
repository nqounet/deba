# Phase B: Task Execution

## Core Instruction
以下の実装ステップを正確に実行してください。設計判断は不要です。

## Context Information
### Target Step
{{STEP_DESCRIPTION}}

### Target File Content
```
{{TARGET_FILE_CONTENT}}
```

### Cautions & Constraints
{{CAUTIONS}}

## Error Handling
### Ambiguity Reported
実装の詳細が不明な場合は、変更を行わずに以下の形式で報告してください:
AMBIGUITY: （何が不明か）

## Output Instructions
変更後のコードのみを出力してください。
複数のファイルに変更が必要な場合は、以下のように各ファイルの内容を Markdown のコードブロックで出力してください。
各コードブロックの開始部分（```の直後）に、対象のファイルパスを記載してください。

```[ファイルパス]
[内容]
```

例:
```src/utils/git.ts
import ...
...
```

```test/git.test.ts
import ...
...
```

1つのファイルのみに変更を適用する場合でも、この形式（コードブロックを使用し、ファイルパスを明示）を推奨します。
Markdown のコードブロック記号（```）を必ず使用してください。
JSON などの解説や前置き、あとがきは一切出力しないでください。
純粋なコードファイルの内容全体を出力してください。
