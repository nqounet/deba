import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import { getRepoStorageRoot } from './utils/git.js';

export interface SnapshotData {
  input: string;
  outputRaw: string;
  outputParsed?: any;
  meta: any;
}

export async function saveSnapshot(taskId: string, data: SnapshotData, prefix?: string): Promise<string> {
  const snapshotDir = path.join(getRepoStorageRoot(), 'snapshots', taskId);
  
  await fs.mkdir(snapshotDir, { recursive: true });

  const p = prefix ? `${prefix}_` : '';
  await fs.writeFile(path.join(snapshotDir, `${p}input.md`), data.input, 'utf-8');
  await fs.writeFile(path.join(snapshotDir, `${p}output_raw.txt`), data.outputRaw, 'utf-8');
  
  if (data.outputParsed) {
    // 構造体をYAML形式に変換して保存
    const yamlString = typeof data.outputParsed === 'string' 
      ? data.outputParsed 
      : yaml.stringify(data.outputParsed);
    await fs.writeFile(
      path.join(snapshotDir, `${p}output_parsed.yml`), 
      yamlString,
      'utf-8'
    );
  }

  await fs.writeFile(path.join(snapshotDir, `${p}meta.json`), JSON.stringify(data.meta, null, 2), 'utf-8');

  return snapshotDir;
}

import crypto from 'crypto';

// 精度の高い task_id ジェネレータ
export function generateTaskId(): string {
  const now = new Date();
  // YYYYMMDD_HHMMSS
  const dateStr = now.getUTCFullYear().toString() +
    (now.getUTCMonth() + 1).toString().padStart(2, '0') +
    now.getUTCDate().toString().padStart(2, '0');
  
  const timeStr = now.getUTCHours().toString().padStart(2, '0') +
    now.getUTCMinutes().toString().padStart(2, '0') +
    now.getUTCSeconds().toString().padStart(2, '0');
    
  // UUID の最初のセクション (8文字) を使用して衝突を避ける
  const randomPart = crypto.randomUUID().split('-')[0];

  return `task_${dateStr}_${timeStr}_${randomPart}`;
}
