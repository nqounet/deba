import { spawn } from 'child_process';
import { spinner } from '../../utils/spinner.js';

export async function executeCLI(
  command: string,
  args: string[],
  input: string,
  options: { silent?: boolean } = {}
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdin.write(input);
    child.stdin.end();

    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });

    child.on('close', (code) => {
      if (code !== 0) {
        if (!options.silent) spinner.fail(`Request failed with exit code ${code}`);
        reject(new Error(`${command} CLI failed with exit code ${code}\nstderr: ${stderr}`));
        return;
      }
      resolve(stdout);
    });

    child.on('error', (err) => {
      reject(new Error(`${command} CLI execution failed: ${err.message}`));
    });
  });
}