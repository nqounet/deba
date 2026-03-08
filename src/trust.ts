import * as fs from 'fs/promises';
import * as path from 'path';
import { getRepoStorageRoot } from './utils/git.js';

export interface TrustData {
  totalTasks: number;
  approvedTasks: number;
  recentHistory: boolean[];
}

export async function getTrustData(): Promise<TrustData> {
  const trustFile = path.join(getRepoStorageRoot(), 'brain', 'trust', 'trust.json');
  try {
    const data = await fs.readFile(trustFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { totalTasks: 0, approvedTasks: 0, recentHistory: [] };
  }
}

export async function updateTrust(success: boolean): Promise<void> {
  const trustDir = path.join(getRepoStorageRoot(), 'brain', 'trust');
  await fs.mkdir(trustDir, { recursive: true });
  
  const data = await getTrustData();
  data.totalTasks += 1;
  if (success) {
    data.approvedTasks += 1;
  }
  data.recentHistory.push(success);
  if (data.recentHistory.length > 50) {
    data.recentHistory.shift();
  }

  await fs.writeFile(path.join(trustDir, 'trust.json'), JSON.stringify(data, null, 2), 'utf-8');
}

export function calculateTrustLevel(data: TrustData): number {
  if (data.totalTasks === 0) return 1;

  if (data.totalTasks >= 30) {
    const recent50 = data.recentHistory.slice(-50);
    const approved50 = recent50.filter(v => v).length;
    if (approved50 / recent50.length >= 0.9) return 3;
  }

  if (data.totalTasks >= 10) {
    const recent20 = data.recentHistory.slice(-20);
    const approved20 = recent20.filter(v => v).length;
    if (approved20 / recent20.length >= 0.8) return 2;
  }

  return 1;
}

export function getTrustLevelName(level: number): string {
  switch (level) {
    case 3: return 'Trusted (信頼)';
    case 2: return 'Independent (一人前)';
    default: return 'Apprentice (見習い)';
  }
}