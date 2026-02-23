export interface DagValidationResult {
  isValid: boolean;
  errors: string[];
  batches: StepBatch[]; // 実行順に並んだバッチの配列
}

export interface StepBatch {
  steps: any[];
}

export function validateAndBuildBatches(steps: any[]): DagValidationResult {
  const errors: string[] = [];
  
  if (!steps || steps.length === 0) {
    return { isValid: true, errors: [], batches: [] };
  }

  // ステップIDからステップオブジェクトへのマップ
  const stepMap = new Map<string | number, any>();
  steps.forEach(step => {
    if (step.id !== undefined && step.id !== null) {
      stepMap.set(step.id, step);
    }
  });

  // 1. 存在しない依存先への参照チェック
  steps.forEach(step => {
    if (Array.isArray(step.dependencies)) {
      step.dependencies.forEach((depId: any) => {
        if (!stepMap.has(depId)) {
          errors.push(`Step ${step.id} has a dependency on undefined step ID: ${depId}`);
        }
      });
    }
  });

  if (errors.length > 0) {
    return { isValid: false, errors, batches: [] };
  }

  // 2. 循環参照チェック (深さ優先探索)
  const visited = new Set<string | number>();
  const recStack = new Set<string | number>();

  function hasCycle(stepId: string | number): boolean {
    if (!visited.has(stepId)) {
      visited.add(stepId);
      recStack.add(stepId);

      const st = stepMap.get(stepId);
      if (st && Array.isArray(st.dependencies)) {
        for (const depId of st.dependencies) {
          if (!visited.has(depId) && hasCycle(depId)) {
            return true;
          } else if (recStack.has(depId)) {
            errors.push(`Circular dependency detected involving step ID: ${stepId} and ${depId}`);
            return true;
          }
        }
      }
    }
    recStack.delete(stepId);
    return false;
  }

  for (const stepId of stepMap.keys()) {
    if (!visited.has(stepId)) {
      if (hasCycle(stepId)) {
        break; // 循環を見つけたら終了
      }
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors, batches: [] };
  }

  // 3. バッチ分割（依存ツリーの深さに基づく）
  // in-degree (入次数：依存している数) ではなく、
  // この処理では「依存先がすべて解決されているか」でバッチを組む
  let remainingSteps = [...steps];
  const batches: StepBatch[] = [];
  const completedStepIds = new Set<string | number>();

  while (remainingSteps.length > 0) {
    const currentBatchSteps: any[] = [];
    const filesModifiedInCurrentBatch = new Set<string>();
    const nextRemaining: any[] = [];
    let isExclusiveBatch = false;

    for (const step of remainingSteps) {
      if (isExclusiveBatch) {
        // すでに現在のバッチが並行不可(専用)になっている場合は全て次へ
        nextRemaining.push(step);
        continue;
      }

      // 依存先がすべて完了しているかチェック
      const deps = step.dependencies || [];
      const allDepsCompleted = deps.every((depId: any) => completedStepIds.has(depId));

      if (allDepsCompleted) {
        if (step.parallelizable === false) {
          if (currentBatchSteps.length > 0) {
            // すでに他のステップがバッチにあるなら、このステップは次のバッチへ
            nextRemaining.push(step);
            continue;
          } else {
            // このステップがバッチの最初の要素である場合、このバッチは専有される
            isExclusiveBatch = true;
          }
        }
        
        // ファイルの排他チェック
        const targetFiles = step.target_files || [];
        let fileConflict = false;
        if (step.parallelizable !== false) {
           for (const file of targetFiles) {
             if (filesModifiedInCurrentBatch.has(file)) {
               fileConflict = true;
               break;
             }
           }
        }

        if (fileConflict) {
          nextRemaining.push(step);
        } else {
          currentBatchSteps.push(step);
          targetFiles.forEach((f: string) => filesModifiedInCurrentBatch.add(f));
        }
      } else {
        nextRemaining.push(step);
      }
    }

    // もし1つもバッチに追加できなかった場合（ロジックの不具合による無限ループ回避）
    if (currentBatchSteps.length === 0) {
       errors.push("Failed to resolve dependencies for remaining steps. This is likely an internal error or unresolved cycle.");
       return { isValid: false, errors, batches: [] };
    }

    batches.push({ steps: currentBatchSteps });
    
    // バッチに追加されたステップを完了済みにマーク
    currentBatchSteps.forEach(s => completedStepIds.add(s.id));
    
    // 次のイテレーションへ
    remainingSteps = nextRemaining;
  }

  return { isValid: true, errors: [], batches };
}
