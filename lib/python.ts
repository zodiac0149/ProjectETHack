import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function runPython(moduleName: string, args: string[]): Promise<any> {
  const pythonPath = process.env.PYTHON_PATH || "python";
  
  const escapedArgs = args.map(arg => `"${arg.replace(/"/g, '\\"')}"`).join(" ");
  const command = `${pythonPath} -m ${moduleName} ${escapedArgs}`;
  
  try {
    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, PYTHONPATH: process.cwd() }
    });
    if (stderr && !stdout) {
      throw new Error(stderr);
    }
    return JSON.parse(stdout);
  } catch (error) {
    console.error(`Python execution error (${moduleName}):`, error);
    throw error;
  }
}
