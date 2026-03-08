import { generateContent } from '../ai.js';
import { saveSnapshot } from '../snapshot.js';
import { buildPlanningPrompt, buildRepairPrompt } from '../prompt.js';
import { extractAndParseYaml } from '../yamlParser.js';
import { validatePlanning } from '../validator.js';
import { loadConfig } from '../utils/config.js';

export interface PlanningResult {
  yamlRaw: string;
  parsedObject: any;
  error?: string;
  snapshotDir: string;
}

export async function executePlanning(taskId: string, request: string, options: { file?: string[] }): Promise<PlanningResult> {
  console.log('Building Planning prompt...');
  const initialPrompt = await buildPlanningPrompt(request, options.file);
  const config = await loadConfig();

  let yamlRaw = '';
  let parsedObject: any = null;
  let error: string | undefined = undefined;
  
  let currentPrompt = initialPrompt;
  let text = '';
  let meta = {};

  const maxRetries = 3;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const isRepair = attempt > 0;
    const aiConfig = isRepair ? config.ai.execution : config.ai.planning;
    const aiResult = await generateContent(currentPrompt, aiConfig);
    text = aiResult.text;
    meta = aiResult.meta;
    
    console.log(`Extracting and parsing YAML (Attempt ${attempt + 1}/${maxRetries + 1})...`);
    const extractResult = extractAndParseYaml(text);
    yamlRaw = extractResult.yamlRaw;
    parsedObject = extractResult.parsedObject;
    error = extractResult.error;

    const needsRepair = error || !parsedObject || typeof parsedObject !== 'object' || !validatePlanning(parsedObject).isValid;

    if (!needsRepair) {
      if (attempt > 0) {
        console.log('✅ Self-healing successful!');
      }
      break;
    }

    const errorDetail = error || (parsedObject && typeof parsedObject === 'object' ? validatePlanning(parsedObject).errors.join(', ') : '出力が正しいオブジェクト形式ではありません');
    console.warn(`⚠️ YAML/JSON validation/parse error: ${errorDetail}`);
    
    if (attempt < maxRetries) {
      console.log(`Attempting self-healing (retry ${attempt + 1}/${maxRetries})...`);
      currentPrompt = await buildRepairPrompt(errorDetail);
    } else {
      console.error(`❌ Self-healing failed after ${maxRetries} retries.`);
    }
    attempt++;
  }

  const snapshotDir = await saveSnapshot(taskId, {
    input: initialPrompt,
    outputRaw: text,
    outputParsed: parsedObject || { error: 'Parse failed', message: error, raw: yamlRaw },
    meta: meta,
  }, 'planning');

  return { yamlRaw, parsedObject, error, snapshotDir };
}
