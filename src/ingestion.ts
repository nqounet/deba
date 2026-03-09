import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { generateContent } from './ai.js';
import { getMainRepoRoot, getRepoStorageRoot } from './utils/git-base.js';
import { buildIngestionPrompt } from './prompt.js';
import { loadConfig } from './utils/config.js';

function getIngestionPaths() {
  const brainDir = path.join(getRepoStorageRoot(), 'brain');
  return {
    brainDir,
    ingestionPath: path.join(brainDir, 'ingestion.md')
  };
}

/**
 * プロジェクトの全体構造と技術スタックを調査し、brain/ingestion.md を生成する
 */
export async function performIngestion(): Promise<string> {
  console.log('🔍 Starting project ingestion (Initial investigation)...');
  
  const rootDir = getMainRepoRoot();
  const { brainDir, ingestionPath } = getIngestionPaths();
  
  // 1. ファイルツリーの取得 (git ls-files を使用してノイズを除去)
  let fileTree = '';
  try {
    fileTree = execSync('git ls-files | head -n 100', { cwd: rootDir, encoding: 'utf8' });
  } catch {
    // Git管理下でない場合のフォールバック（簡易的なreaddir）
    const files = await fs.readdir(rootDir);
    fileTree = files.slice(0, 50).join('\n');
  }

  // 2. 主要ファイルの読み込み (package.json, README.md 等)
  const importantFiles = ['package.json', 'README.md', 'tsconfig.json', 'go.mod', 'Cargo.toml', 'requirements.txt'];
  let contextFiles = '';
  
  for (const file of importantFiles) {
    try {
      const content = await fs.readFile(path.join(rootDir, file), 'utf-8');
      contextFiles += `\n--- ${file} ---\n${content.substring(0, 2000)}\n`;
    } catch {
      // ファイルが存在しない場合はスキップ
    }
  }

  // 3. LLM への解析依頼
  const prompt = await buildIngestionPrompt(fileTree, contextFiles);
  const config = await loadConfig();

  try {
    const response = await generateContent(prompt, config.ai.execution);
    const ingestionContent = response.text;

    await fs.mkdir(brainDir, { recursive: true });
    await fs.writeFile(ingestionPath, ingestionContent, 'utf-8');
    
    console.log(`✅ Ingestion completed. Saved to ${ingestionPath}`);
    return ingestionContent;
  } catch (error: any) {
    console.error(`❌ Ingestion failed: ${error.message}`);
    return '※プロジェクトの解析に失敗しました。';
  }
}

/**
 * 既存の ingestion.md を読み込む。存在しない場合は自動的に実行する。
 */
export async function loadIngestion(): Promise<string> {
  const { ingestionPath } = getIngestionPaths();
  try {
    return await fs.readFile(ingestionPath, 'utf-8');
  } catch {
    return await performIngestion();
  }
}
