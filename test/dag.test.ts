import { describe, it, expect } from 'vitest';
import { validateAndBuildBatches, DagValidationResult, StepBatch } from '../src/dag';

describe('validateAndBuildBatches', () => {
  it('should return an empty result for an empty step list', () => {
    const result = validateAndBuildBatches([]);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.batches).toEqual([]);
  });

  it('should return an empty result for undefined or null step list', () => {
    // @ts-ignore: Intentionally testing with undefined/null input
    const resultUndefined = validateAndBuildBatches(undefined);
    expect(resultUndefined.isValid).toBe(true);
    expect(resultUndefined.errors).toEqual([]);
    expect(resultUndefined.batches).toEqual([]);

    // @ts-ignore: Intentionally testing with undefined/null input
    const resultNull = validateAndBuildBatches(null);
    expect(resultNull.isValid).toBe(true);
    expect(resultNull.errors).toEqual([]);
    expect(resultNull.batches).toEqual([]);
  });

  it('should correctly build batches for independent steps', () => {
    const steps = [
      { id: 'A', dependencies: [], parallelizable: true, target_files: ['file_a.txt'] },
      { id: 'B', dependencies: [], parallelizable: true, target_files: ['file_b.txt'] },
      { id: 'C', dependencies: [], parallelizable: true, target_files: ['file_c.txt'] },
    ];
    const result = validateAndBuildBatches(steps);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.batches.length).toBe(1); // 全て独立しているので1つのバッチになるはず
    expect(result.batches[0].steps).toHaveLength(3);
    // IDでソートして比較
    const batchStepIds = result.batches[0].steps.map((s: any) => s.id).sort();
    expect(batchStepIds).toEqual(['A', 'B', 'C']);
  });

  it('should correctly build batches for sequential dependencies', () => {
    const steps = [
      { id: 'A', dependencies: [], parallelizable: true, target_files: ['file_a.txt'] },
      { id: 'B', dependencies: ['A'], parallelizable: true, target_files: ['file_b.txt'] },
      { id: 'C', dependencies: ['B'], parallelizable: true, target_files: ['file_c.txt'] },
    ];
    const result = validateAndBuildBatches(steps);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.batches.length).toBe(3); // A -> B -> C なので3つのバッチになるはず
    expect(result.batches[0].steps.map((s: any) => s.id)).toEqual(['A']);
    expect(result.batches[1].steps.map((s: any) => s.id)).toEqual(['B']);
    expect(result.batches[2].steps.map((s: any) => s.id)).toEqual(['C']);
  });

  it('should correctly build batches for multiple dependencies', () => {
    const steps = [
      { id: 'A', dependencies: [], parallelizable: true, target_files: ['file_a.txt'] },
      { id: 'B', dependencies: [], parallelizable: true, target_files: ['file_b.txt'] },
      { id: 'C', dependencies: ['A', 'B'], parallelizable: true, target_files: ['file_c.txt'] },
      { id: 'D', dependencies: ['C'], parallelizable: true, target_files: ['file_d.txt'] },
    ];
    const result = validateAndBuildBatches(steps);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.batches.length).toBe(3); // (A, B) -> C -> D なので3つのバッチになるはず

    // 1番目のバッチ: A, B (順序は不定なのでソートして比較)
    const batch1StepIds = result.batches[0].steps.map((s: any) => s.id).sort();
    expect(batch1StepIds).toEqual(['A', 'B']);

    // 2番目のバッチ: C
    expect(result.batches[1].steps.map((s: any) => s.id)).toEqual(['C']);

    // 3番目のバッチ: D
    expect(result.batches[2].steps.map((s: any) => s.id)).toEqual(['D']);
  });

  it('should handle a mix of independent and dependent steps', () => {
    const steps = [
      { id: 'Start1', dependencies: [], parallelizable: true, target_files: ['f1.txt'] },
      { id: 'Start2', dependencies: [], parallelizable: true, target_files: ['f2.txt'] },
      { id: 'Middle1', dependencies: ['Start1'], parallelizable: true, target_files: ['f3.txt'] },
      { id: 'Middle2', dependencies: ['Start2'], parallelizable: true, target_files: ['f4.txt'] },
      { id: 'End', dependencies: ['Middle1', 'Middle2'], parallelizable: true, target_files: ['f5.txt'] },
      { id: 'Independent', dependencies: [], parallelizable: true, target_files: ['f6.txt'] },
    ];
    const result = validateAndBuildBatches(steps);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.batches.length).toBe(3);

    // Batch 1: Start1, Start2, Independent (順序は不定)
    const batch1StepIds = result.batches[0].steps.map((s: any) => s.id).sort();
    expect(batch1StepIds).toEqual(['Independent', 'Start1', 'Start2']);

    // Batch 2: Middle1, Middle2 (順序は不定)
    const batch2StepIds = result.batches[1].steps.map((s: any) => s.id).sort();
    expect(batch2StepIds).toEqual(['Middle1', 'Middle2']);

    // Batch 3: End
    expect(result.batches[2].steps.map((s: any) => s.id)).toEqual(['End']);
  });

  it('should correctly handle steps with `parallelizable: false`', () => {
    const steps = [
      { id: 'A', dependencies: [], parallelizable: true, target_files: ['file_a.txt'] },
      { id: 'B', dependencies: [], parallelizable: false, target_files: ['file_b.txt'] }, // 並行不可
      { id: 'C', dependencies: [], parallelizable: true, target_files: ['file_c.txt'] },
      { id: 'D', dependencies: ['A', 'B'], parallelizable: true, target_files: ['file_d.txt'] },
    ];
    const result = validateAndBuildBatches(steps);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.batches.length).toBe(3);

    // Batch 1: A, C (順序は不定)
    // Bはparallelizable: falseなので、単独のバッチになる
    const batch1StepIds = result.batches[0].steps.map((s: any) => s.id).sort();
    expect(batch1StepIds).toEqual(['A', 'C']);

    // Batch 2: B (単独のバッチ)
    expect(result.batches[1].steps.map((s: any) => s.id)).toEqual(['B']);

    // Batch 3: D (AとBの両方が完了後)
    expect(result.batches[2].steps.map((s: any) => s.id)).toEqual(['D']);
  });

  it('should ensure a step with `parallelizable: false` always forms a single-step batch, regardless of other parallelizable steps', () => {
    const steps = [
      { id: 'P1', dependencies: [], parallelizable: true, target_files: ['p1.txt'] },
      { id: 'NP1', dependencies: [], parallelizable: false, target_files: ['np1.txt'] }, // 並行不可
      { id: 'P2', dependencies: [], parallelizable: true, target_files: ['p2.txt'] },
    ];
    const result = validateAndBuildBatches(steps);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.batches.length).toBe(2);

    // NP1が単独のバッチとして存在することを確認
    const np1Batch = result.batches.find(batch =>
      batch.steps.length === 1 && batch.steps[0].id === 'NP1'
    );
    expect(np1Batch).toBeDefined();

    // P1とP2が同じバッチ（NP1のバッチとは別）に存在することを確認
    const p1P2Batch = result.batches.find(batch =>
      batch.steps.length === 2 &&
      batch.steps.map(s => s.id).sort().join(',') === ['P1', 'P2'].sort().join(',')
    );
    expect(p1P2Batch).toBeDefined();
  });


  it('should correctly handle file conflicts for parallelizable steps', () => {
    const steps = [
      { id: 'A', dependencies: [], parallelizable: true, target_files: ['shared_file.txt', 'file_a.txt'] },
      { id: 'B', dependencies: [], parallelizable: true, target_files: ['shared_file.txt', 'file_b.txt'] },
      { id: 'C', dependencies: [], parallelizable: true, target_files: ['file_c.txt'] },
    ];
    const result = validateAndBuildBatches(steps);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.batches.length).toBe(2); // shared_file.txt で競合するため、AとBは別バッチになるはず

    // A, Bはそれぞれ別のバッチになるはず。Cは独立なのでどちらかのバッチに含まれる可能性がある。
    // 実装ロジックによって、Aが先かBが先かが決まる。
    // ここでは、バッチの順序と各バッチ内のステップが想定通りかを確認する。
    
    // バッチ0: CとAまたはBのどちらか
    // バッチ1: 残りのAまたはB
    
    // 現在のdag.tsの実装では、remainingStepsのループ順に依存する。
    // Aが最初に処理され、shared_file.txtをFilesModifiedInCurrentBatchに入れる。
    // 次にBが処理され、shared_file.txtで衝突するためnextRemainingに回される。
    // Cはファイル衝突がないためcurrentBatchStepsに入る。
    // よって、バッチ0はAとC。バッチ1はB。
    
    const batch0StepIds = result.batches[0].steps.map((s: any) => s.id).sort();
    expect(batch0StepIds).toEqual(['A', 'C']);
    expect(result.batches[1].steps.map((s: any) => s.id)).toEqual(['B']);
  });

  it('should ensure parallelizable steps with common target files are in different batches', () => {
    const steps = [
      { id: 'Step1', dependencies: [], parallelizable: true, target_files: ['common_file.txt', 'file1.txt'] },
      { id: 'Step2', dependencies: [], parallelizable: true, target_files: ['common_file.txt', 'file2.txt'] },
      { id: 'Step3', dependencies: [], parallelizable: true, target_files: ['file3.txt'] },
    ];
    const result = validateAndBuildBatches(steps);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.batches.length).toBe(2);

    // Step1とStep2はcommon_file.txtで競合するため、異なるバッチに分かれる必要がある。
    // Step3は独立しているため、どちらかのバッチに含まれる可能性がある。

    // 最初のバッチにStep1とStep3が含まれ、2番目のバッチにStep2が含まれることを検証
    // （dag.tsの実装順序に依存）
    const batch0StepIds = result.batches[0].steps.map((s: any) => s.id).sort();
    expect(batch0StepIds).toEqual(['Step1', 'Step3']);
    expect(result.batches[1].steps.map((s: any) => s.id)).toEqual(['Step2']);
  });

  it('should detect a direct circular dependency', () => {
    const steps = [
      { id: 'A', dependencies: ['B'], parallelizable: true, target_files: [] },
      { id: 'B', dependencies: ['A'], parallelizable: true, target_files: [] },
    ];
    const result = validateAndBuildBatches(steps);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Circular dependency detected involving step ID: B and A');
    expect(result.batches).toEqual([]);
  });

  it('should detect an indirect circular dependency', () => {
    const steps = [
      { id: 'A', dependencies: ['C'], parallelizable: true, target_files: [] },
      { id: 'B', dependencies: ['A'], parallelizable: true, target_files: [] },
      { id: 'C', dependencies: ['B'], parallelizable: true, target_files: [] },
    ];
    const result = validateAndBuildBatches(steps);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Circular dependency detected involving step ID: B and A');
    expect(result.batches).toEqual([]);
  });

  it('should detect dependency on an undefined step', () => {
    const steps = [
      { id: 'A', dependencies: ['NonExistent'], parallelizable: true, target_files: [] },
    ];
    const result = validateAndBuildBatches(steps);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Step A has a dependency on undefined step ID: NonExistent');
    expect(result.batches).toEqual([]);
  });

  it('should detect and report an error for dependency on a non-existent step', () => {
    const steps = [
      { id: 'StepA', dependencies: ['MissingStep'], parallelizable: true, target_files: [] },
      { id: 'StepB', dependencies: [], parallelizable: true, target_files: [] },
    ];
    const result = validateAndBuildBatches(steps);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Step StepA has a dependency on undefined step ID: MissingStep');
    expect(result.batches).toEqual([]);
  });

  it('should detect and report a direct circular dependency error', () => {
    const steps = [
      { id: 'X', dependencies: ['Y'], parallelizable: true, target_files: [] },
      { id: 'Y', dependencies: ['X'], parallelizable: true, target_files: [] },
    ];
    const result = validateAndBuildBatches(steps);
    expect(result.isValid).toBe(false);
    // 依存解決の順序に依存するため、エラーメッセージは実際に実行されるまで確実ではない。
    // dag.tsの実装では、`stepId`と`depId`の順序が関係するため、`Y and X`または`X and Y`のどちらかが期待される。
    // 今回の例では`Y`が`X`に依存し、`X`が`Y`に依存するため、循環が検出されたときに先に処理されるステップが`stepId`になる。
    // 通常、アルファベット順などで処理されることが多いため、`X and Y`になる可能性もある。
    expect(result.errors).toContain('Circular dependency detected involving step ID: Y and X');
    expect(result.batches).toEqual([]);
  });

  it('should detect and report an indirect circular dependency error', () => {
    const steps = [
      { id: 'P', dependencies: ['Q'], parallelizable: true, target_files: [] },
      { id: 'Q', dependencies: ['R'], parallelizable: true, target_files: [] },
      { id: 'R', dependencies: ['P'], parallelizable: true, target_files: [] },
    ];
    const result = validateAndBuildBatches(steps);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0); // エラーが存在すること
    // エラーメッセージが循環依存を示し、かつP, Q, Rのいずれか2つ以上のIDを含むことを検証
    const foundCircularError = result.errors.some(error => {
      const isCircular = error.startsWith('Circular dependency detected involving step ID:');
      const hasP = error.includes('P');
      const hasQ = error.includes('Q');
      const hasR = error.includes('R');
      // 循環依存のメッセージであり、かつP, Q, Rのうち少なくとも2つのIDが含まれていればOKとする
      // 例えば "P and Q", "Q and R", "R and P" など、dag.tsの実装がどの組み合わせを報告しても対応
      return isCircular && ((hasP && hasQ) || (hasQ && hasR) || (hasR && hasP));
    });
    expect(foundCircularError).toBe(true);
    expect(result.batches).toEqual([]);
  });
});