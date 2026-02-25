import { describe, it, expect } from 'vitest';
import { generateTaskId } from '../src/snapshot.js';

describe('generateTaskId', () => {
  it('should generate a task ID starting with task_ and matching the new format', () => {
    const taskId = generateTaskId();
    // task_YYYYMMDD_HHMMSS_RANDOM8
    expect(taskId).toMatch(/^task_\d{8}_\d{6}_[a-f0-9]{8}$/);
  });

  it('should generate different IDs when called sequentially', () => {
    const ids = new Map();
    for (let i = 0; i < 1000; i++) {
      const id = generateTaskId();
      if (ids.has(id)) {
        throw new Error(`Collision detected: ${id} at index ${i}`);
      }
      ids.set(id, i);
    }
    expect(ids.size).toBe(1000);
  });
});
