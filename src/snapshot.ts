import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';

export interface SnapshotData {
  input: string;
  outputRaw: string;
  outputParsed?: any;
  meta: any;
}

export async function saveSnapshot(taskId: string, data: SnapshotData, prefix?: string): Promise<string> {
  const snapshotDir = path.join(process.cwd(), 'snapshots', taskId);
  
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

// 簡単な task_id ジェネレータ
export function generateTaskId(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, ''); // yyyymmdd
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, ''); // hhmmss
  return `task_${dateStr}_${timeStr}`;
}
