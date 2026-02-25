import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { generateContent } from './ai.js';
import { getMainRepoRoot } from './utils/git.js';

const BRAIN_DIR = path.join(getMainRepoRoot(), 'brain');
const INGESTION_PATH = path.join(BRAIN_DIR, 'ingestion.md');

/**
 * プロジェクトの全体構造と技術スタックを調査し、brain/ingestion.md を生成する
 */
export async function performIngestion(): Promise<string> {
  console.log('🔍 Starting project ingestion (Initial investigation)...');
  
  const rootDir = getMainRepoRoot();
  
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
  const prompt = `あなたは熟練のソフトウェアアーキテクトです。
以下のプロジェクト情報を分析し、このプロジェクトの「地図」となるサマリーを Markdown 形式で作成してください。

## 調査対象データ
### ファイルツリー (抜粋)
${fileTree}

### 主要ファイルの内容
${contextFiles}

## 出力指示
以下の項目を含む、簡潔で構造化された ingestion.md を出力してください。
1. **プロジェクト概要**: 何のためのソフトウェアか
2. **技術スタック**: 言語、主要ライブラリ、フレームワーク
3. **アーキテクチャ**: 採用されている設計パターン（例: Onion Architecture, MVC等）
4. **主要ディレクトリの役割**: 各フォルダに何が置かれているか
5. **開発・実行方法**: ビルド、テスト、実行の基本コマンド

出力は Markdown 本体のみとし、前置きや解説は一切含めないでください。`;

  try {
    const response = await generateContent(prompt);
    const ingestionContent = response.text;

    await fs.mkdir(BRAIN_DIR, { recursive: true });
    await fs.writeFile(INGESTION_PATH, ingestionContent, 'utf-8');
    
    console.log(`✅ Ingestion completed. Saved to ${INGESTION_PATH}`);
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
  try {
    return await fs.readFile(INGESTION_PATH, 'utf-8');
  } catch {
    return await performIngestion();
  }
}
