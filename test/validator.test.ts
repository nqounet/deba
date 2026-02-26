import { describe, it, expect } from 'vitest';
import { validatePhaseA } from '../src/validator';

describe('validatePhaseA', () => {
  // 正常系テストケース
  it('should return isValid: true and no errors/warnings for a valid Phase A plan', () => {
    const validData = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1', 'Criterion 2'],
        specs: ['Spec 1', 'Spec 2']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            parallelizable: true,
            dependencies: []
          },
          {
            id: 'step2',
            description: 'Step 2 description',
            target_files: ['file2.ts', 'file3.ts'],
            test_command: 'npm test -- step2',
            parallelizable: false,
            dependencies: [1]
          }
        ]
      },
      cautions: [
        {
          context: 'Deployment',
          instruction: 'Be careful during deployment.'
        }
      ]
    };

    const result = validatePhaseA(validData);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  // スキーマ違反（エラー）テストケース
  it('should return isValid: false and errors for missing requirements object', () => {
    const invalidData = {
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            parallelizable: true,
            dependencies: []
          }
        ]
      }
    };
    const result = validatePhaseA(invalidData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Missing "requirements" object.');
  });

  it('should return isValid: false and errors for missing requirements.goal', () => {
    const invalidData = {
      requirements: {
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            parallelizable: true,
            dependencies: []
          }
        ]
      }
    };
    const result = validatePhaseA(invalidData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Missing "requirements.goal".');
  });

  it('should return isValid: false and errors for missing or empty requirements.acceptance_criteria', () => {
    const invalidData1 = {
      requirements: {
        goal: 'Implement feature X'
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            parallelizable: true,
            dependencies: []
          }
        ]
      }
    };
    const invalidData2 = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: []
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            parallelizable: true,
            dependencies: []
          }
        ]
      }
    };
    const result1 = validatePhaseA(invalidData1);
    expect(result1.isValid).toBe(false);
    expect(result1.errors).toContain('Missing or empty "requirements.acceptance_criteria".');
    const result2 = validatePhaseA(invalidData2);
    expect(result2.isValid).toBe(false);
    expect(result2.errors).toContain('Missing or empty "requirements.acceptance_criteria".');
  });

  it('should return isValid: false and errors for missing implementation_plan object', () => {
    const invalidData = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      }
    };
    const result = validatePhaseA(invalidData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Missing "implementation_plan" object.');
  });

  it('should return isValid: false and errors for missing or invalid implementation_plan.steps', () => {
    const invalidData1 = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {}
    };
    const invalidData2 = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: 'not an array'
      }
    };
    const result1 = validatePhaseA(invalidData1);
    expect(result1.isValid).toBe(false);
    expect(result1.errors).toContain('Missing or invalid "implementation_plan.steps". Must be an array.');
    const result2 = validatePhaseA(invalidData2);
    expect(result2.isValid).toBe(false);
    expect(result2.errors).toContain('Missing or invalid "implementation_plan.steps". Must be an array.');
  });

  it('should return isValid: false and errors for empty implementation_plan.steps', () => {
    const invalidData = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: []
      }
    };
    const result = validatePhaseA(invalidData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('"implementation_plan.steps" is empty. At least one step is required.');
  });

  it('should return isValid: false and errors for a step that is not an object', () => {
    const invalidData = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: [
          'not an object'
        ]
      }
    };
    const result = validatePhaseA(invalidData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Step at index 0 is not an object.');
  });

  it('should return isValid: false and errors for a step missing id', () => {
    const invalidData = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: [
          {
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            parallelizable: true,
            dependencies: []
          }
        ]
      }
    };
    const result = validatePhaseA(invalidData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Step at index 0 is missing "id".');
  });

  it('should return isValid: false and errors for duplicate step IDs', () => {
    const invalidData = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            parallelizable: true,
            dependencies: []
          },
          {
            id: 1,
            description: 'Step 2 description',
            target_files: ['file2.ts'],
            parallelizable: false,
            dependencies: []
          }
        ]
      }
    };
    const result = validatePhaseA(invalidData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Duplicate step ID found: 1');
  });

  it('should return isValid: false and errors for a step missing description', () => {
    const invalidData = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            target_files: ['file1.ts'],
            parallelizable: true,
            dependencies: []
          }
        ]
      }
    };
    const result = validatePhaseA(invalidData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Step 1 is missing "description".');
  });

  it('should return isValid: false and errors for a step missing or invalid target_files', () => {
    const invalidData1 = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            parallelizable: true,
            dependencies: []
          }
        ]
      }
    };
    const invalidData2 = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: 'not an array',
            parallelizable: true,
            dependencies: []
          }
        ]
      }
    };
    const result1 = validatePhaseA(invalidData1);
    expect(result1.isValid).toBe(false);
    expect(result1.errors).toContain('Step 1 is missing or invalid "target_files" (must be an array).');
    const result2 = validatePhaseA(invalidData2);
    expect(result2.isValid).toBe(false);
    expect(result2.errors).toContain('Step 1 is missing or invalid "target_files" (must be an array).');
  });

  it('should return isValid: false and errors for invalid test_command type', () => {
    const invalidData = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            test_command: 123, // Invalid type
            parallelizable: true,
            dependencies: []
          }
        ]
      }
    };
    const result = validatePhaseA(invalidData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Step 1 has invalid "test_command" (must be a string if provided).');
  });

  it('should return isValid: false and errors for a step missing or invalid parallelizable', () => {
    const invalidData1 = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            dependencies: []
          }
        ]
      }
    };
    const invalidData2 = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            parallelizable: 'not a boolean',
            dependencies: []
          }
        ]
      }
    };
    const result1 = validatePhaseA(invalidData1);
    expect(result1.isValid).toBe(false);
    expect(result1.errors).toContain('Step 1 is missing or invalid "parallelizable" (must be a boolean).');
    const result2 = validatePhaseA(invalidData2);
    expect(result2.isValid).toBe(false);
    expect(result2.errors).toContain('Step 1 is missing or invalid "parallelizable" (must be a boolean).');
  });

  it('should return isValid: false and errors for a step missing or invalid dependencies', () => {
    const invalidData1 = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            parallelizable: true
          }
        ]
      }
    };
    const invalidData2 = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            parallelizable: true,
            dependencies: 'not an array'
          }
        ]
      }
    };
    const result1 = validatePhaseA(invalidData1);
    expect(result1.isValid).toBe(false);
    expect(result1.errors).toContain('Step 1 is missing or invalid "dependencies" (must be an array).');
    const result2 = validatePhaseA(invalidData2);
    expect(result2.isValid).toBe(false);
    expect(result2.errors).toContain('Step 1 is missing or invalid "dependencies" (must be an array).');
  });

  // 警告系テストケース
  it('should return warnings for missing or empty requirements.specs', () => {
    const data = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            parallelizable: true,
            dependencies: []
          }
        ]
      }
    };
    const result = validatePhaseA(data);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain('"requirements.specs" is empty or missing. It is recommended to have detailed specs.');
  });

  it('should return warnings for missing or empty cautions', () => {
    const data = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1'],
        specs: ['Spec 1']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            parallelizable: true,
            dependencies: []
          }
        ]
      }
    };
    const result = validatePhaseA(data);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain('"cautions" is empty or missing. It is highly recommended to provide cautions for safety.');
  });

  it('should return warnings for cautions missing context or instruction', () => {
    const data = {
      requirements: {
        goal: 'Implement feature X',
        acceptance_criteria: ['Criterion 1'],
        specs: ['Spec 1']
      },
      implementation_plan: {
        steps: [
          {
            id: 1,
            description: 'Step 1 description',
            target_files: ['file1.ts'],
            parallelizable: true,
            dependencies: []
          }
        ]
      },
      cautions: [
        {
          context: 'Deployment'
        },
        {
          instruction: 'Check logs'
        }
      ]
    };
    const result = validatePhaseA(data);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain('Caution at index 0 is missing "context" or "instruction".');
    expect(result.warnings).toContain('Caution at index 1 is missing "context" or "instruction".');
  });

  it('should return isValid: false and errors if data is not an object', () => {
    const result = validatePhaseA('not an object');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Parsed data is not an object.');
  });

  it('should return isValid: false and errors if data is null', () => {
    const result = validatePhaseA(null);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Parsed data is not an object.');
  });
});