import * as fs from 'fs/promises';
import * as path from 'path';
import { generateContent } from '../ai.js';
import { saveSnapshot } from '../snapshot.js';
import { buildReflectionPrompt } from '../prompt.js';
import { extractAndParseYaml } from '../yamlParser.js';
import { saveEpisode } from '../episode.js';
import { appendGrowthLog } from '../growthLog.js';
import { saveKnowledge, Knowledge } from '../knowledge.js';
import { getRepoStorageRoot } from '../utils/git.js';
import { loadConfig } from '../utils/config.js';
import { updateTrust, getTrustData, calculateTrustLevel, TrustData } from '../trust.js';

export interface ReviewContext {
  originalRequest: string;
  stepsExecuted: string[];
}

export interface ReviewProcessResult {
  trustData: TrustData;
  level: number;
  approvalRate: number;
  episodePath: string;
}

export async function getReviewContext(taskId: string): Promise<ReviewContext> {
  const snapshotDir = path.join(getRepoStorageRoot(), 'snapshots', taskId);
  try {
    await fs.access(snapshotDir);
  } catch {
    throw new Error(`Snapshot directory not found: ${snapshotDir}`);
  }

  let originalRequest = '(不明)';
  try {
    const planningInput = await fs.readFile(path.join(snapshotDir, 'planning_input.md'), 'utf-8');
    originalRequest = planningInput.substring(0, 200) + '...';
  } catch {
    try {
      const input = await fs.readFile(path.join(snapshotDir, 'input.md'), 'utf-8');
      originalRequest = input.substring(0, 200) + '...';
    } catch {
      // ignore
    }
  }

  const files = await fs.readdir(snapshotDir);
  const stepFiles = files.filter(f => f.startsWith('step_') && f.endsWith('_output_raw.txt'));
  const stepsExecuted = stepFiles.map(f => {
    const match = f.match(/step_(\d+)_output_raw\.txt/);
    return match ? `Step ${match[1]}` : f;
  });

  return { originalRequest, stepsExecuted };
}

export async function processReviewResult(taskId: string, context: ReviewContext, isApproved: boolean, feedback: string): Promise<ReviewProcessResult> {
  const episodePath = await saveEpisode({
    taskId,
    request: context.originalRequest,
    stepsExecuted: context.stepsExecuted,
    userFeedback: isApproved ? 'approved' : feedback,
    success: isApproved,
  });

  await updateTrust(isApproved);
  const trustData = await getTrustData();
  const level = calculateTrustLevel(trustData);
  const approvalRate = trustData.recentHistory.length > 0
    ? Math.round((trustData.recentHistory.filter(v => v).length / trustData.recentHistory.length) * 100)
    : 0;
  
  return { trustData, level, approvalRate, episodePath };
}

export async function executeReflection(taskId: string, context: ReviewContext, feedback: string, episodePath: string): Promise<{ parsedObject: any, reflectionText: string }> {
  const episodeSummary = `タスクID: ${taskId}\nユーザー要望: ${context.originalRequest}\n実行ステップ: ${context.stepsExecuted.join(', ')}`;

  let currentSkills = '';
  try {
    const skillsDir = path.join(getRepoStorageRoot(), 'brain', 'skills');
    const skillFiles = await fs.readdir(skillsDir);
    for (const sf of skillFiles) {
      if (sf.endsWith('.md')) {
        const content = await fs.readFile(path.join(skillsDir, sf), 'utf-8');
        currentSkills += `\n### ${sf}\n${content}\n`;
      }
    }
  } catch {
    // ignore
  }

  const reflectionPrompt = await buildReflectionPrompt(episodeSummary, feedback, currentSkills);
  const systemInstruction = "あなたは自己評価を行う新人エンジニアです。指示に従い、YAML形式のみで出力してください。";
  const config = await loadConfig();
  const { text: reflectionText, meta } = await generateContent(reflectionPrompt, config.ai.execution, systemInstruction);

  await saveSnapshot(taskId, {
    input: reflectionPrompt,
    outputRaw: reflectionText,
    meta,
  }, 'reflection');

  const { parsedObject } = extractAndParseYaml(reflectionText);

  if (parsedObject) {
    const learnings = parsedObject.learnings || [];
    for (const learning of learnings) {
      await appendGrowthLog({
        summary: learning.summary || '(要約なし)',
        generalizability: learning.generalizability || 'medium',
        relatedSkills: learning.related_skills || 'new',
        proposedRule: learning.proposed_rule,
        sourceEpisode: episodePath,
      });

      const knowledge: Knowledge = {
        summary: learning.summary || '(要約なし)',
        facts: [learning.proposed_rule || ''],
        inferences: [`Derived from episode: ${taskId}`, `Success state: false (needed correction)`],
        keywords: (learning.summary || '').split(/\s+/).concat(learning.related_skills || '').filter((k: string) => k.length > 2),
        confidence_score: learning.generalizability === 'high' ? 80 : 60,
      };
      await saveKnowledge(taskId, knowledge);
    }
  }

  return { parsedObject, reflectionText };
}
