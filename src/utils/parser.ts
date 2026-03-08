import path from 'path';

export interface FileChange {
  path: string;
  content: string;
}

const COMMON_LANGUAGES = [
  'typescript', 'ts', 'javascript', 'js', 'json', 'yaml', 'yml', 
  'markdown', 'md', 'bash', 'sh', 'python', 'py', 'css', 'html', 
  'go', 'rust', 'rs', 'ruby', 'rb', 'php'
];

/**
 * AI の回答から複数ファイルのコードブロックを抽出・パースする。
 * 形式: ```[file_path]\n[content]\n```
 */
export function parseCodeBlocks(rawOutput: string, targetFiles?: string[]): FileChange[] {
  const codeBlockRegex = /```([\w./\-_]+)?\n([\s\S]*?)\n```/g;
  const fileChanges: FileChange[] = [];
  
  let match;
  while ((match = codeBlockRegex.exec(rawOutput)) !== null) {
    let filePath = match[1] ? match[1].trim() : '';
    const content = match[2].trim();

    // 言語名と思われるものはパスとして採用しない
    const isLanguage = filePath && COMMON_LANGUAGES.includes(filePath.toLowerCase());
    
    // パスが空、または言語名のみ、または target_files に含まれない単一単語の場合の補正
    if (!filePath || isLanguage) {
      if (Array.isArray(targetFiles) && targetFiles.length === 1) {
        filePath = targetFiles[0];
      }
    }

    if (filePath) {
      // パスラベルトラバーサル対策: パスを正規化し、ベースディレクトリを越えていないか確認
      const normalizedPath = path.normalize(filePath);
      if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
        console.warn(`⚠️ Security warning: Blocked attempt to modify file outside working directory: ${filePath}`);
        continue;
      }
      fileChanges.push({ path: normalizedPath, content });
    }
  }

  // もしコードブロックが全く見つからなかった場合は、全文を単一ファイルとして扱う（互換性のため）
  if (fileChanges.length === 0 && Array.isArray(targetFiles) && targetFiles.length > 0) {
    // 前後のバッククォートがあれば除去（旧形式対応）
    const cleanText = rawOutput.replace(/^```(?:\w+)?\n/, '').replace(/\n```$/, '').trim();
    fileChanges.push({ path: targetFiles[0], content: cleanText });
  }

  return fileChanges;
}
