export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validatePhaseA(data: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Parsed data is not an object.'], warnings: [] };
  }

  // 1. requirements
  if (!data.requirements || typeof data.requirements !== 'object') {
    errors.push('Missing "requirements" object.');
  } else {
    if (!data.requirements.goal) {
      errors.push('Missing "requirements.goal".');
    }
    if (!Array.isArray(data.requirements.acceptance_criteria) || data.requirements.acceptance_criteria.length === 0) {
      errors.push('Missing or empty "requirements.acceptance_criteria".');
    }
    
    // 推奨項目のチェック
    if (!Array.isArray(data.requirements.specs) || data.requirements.specs.length === 0) {
      warnings.push('"requirements.specs" is empty or missing. It is recommended to have detailed specs.');
    }
  }

  // 2. implementation_plan
  if (!data.implementation_plan || typeof data.implementation_plan !== 'object') {
    errors.push('Missing "implementation_plan" object.');
  } else {
    if (!Array.isArray(data.implementation_plan.steps)) {
      errors.push('Missing or invalid "implementation_plan.steps". Must be an array.');
    } else if (data.implementation_plan.steps.length === 0) {
      errors.push('"implementation_plan.steps" is empty. At least one step is required.');
    } else {
      const stepIds = new Set<string | number>();
      
      data.implementation_plan.steps.forEach((step: any, index: number) => {
        if (typeof step !== 'object') {
          errors.push(`Step at index ${index} is not an object.`);
          return;
        }

        if (step.id === undefined || step.id === null) {
          errors.push(`Step at index ${index} is missing "id".`);
        } else {
          if (stepIds.has(step.id)) {
            errors.push(`Duplicate step ID found: ${step.id}`);
          }
          stepIds.add(step.id);
        }

        if (!step.description) {
          errors.push(`Step ${step.id ?? `at index ${index}`} is missing "description".`);
        }

        if (!Array.isArray(step.target_files)) {
          errors.push(`Step ${step.id ?? `at index ${index}`} is missing or invalid "target_files" (must be an array).`);
        }

        if (typeof step.parallelizable !== 'boolean') {
          errors.push(`Step ${step.id ?? `at index ${index}`} is missing or invalid "parallelizable" (must be a boolean).`);
        }

        if (!Array.isArray(step.dependencies)) {
          errors.push(`Step ${step.id ?? `at index ${index}`} is missing or invalid "dependencies" (must be an array).`);
        }
      });
    }
  }

  // 3. cautions
  if (!Array.isArray(data.cautions) || data.cautions.length === 0) {
    warnings.push('"cautions" is empty or missing. It is highly recommended to provide cautions for safety.');
  } else {
    data.cautions.forEach((caution: any, index: number) => {
      if (!caution.context || !caution.instruction) {
        warnings.push(`Caution at index ${index} is missing "context" or "instruction".`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
