import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { AppStoreError } from './errors.js';
export interface Configuration { allowedRoots: string[]; allowWrites: boolean; allowSubmission: boolean }
export async function configuration(args: string[]): Promise<Configuration> {
  const result: Configuration = {allowedRoots: [], allowWrites: false, allowSubmission: false};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--allow-writes') result.allowWrites = true;
    else if (arg === '--allow-submission') result.allowSubmission = true;
    else if (arg === '--allowed-root') {
      const root = args[++index];
      if (!root || !isAbsolute(root)) throw new AppStoreError('invalidConfiguration', 'Each allowed root must be an absolute existing directory.');
      try {
        const resolved = await realpath(root);
        if (!(await stat(resolved)).isDirectory()) throw new Error();
        if (!result.allowedRoots.includes(resolved)) result.allowedRoots.push(resolved);
      } catch { throw new AppStoreError('invalidConfiguration', 'An allowed root is not an accessible directory.'); }
    } else throw new AppStoreError('invalidConfiguration', 'Unknown command-line option. Use --help.');
  }
  if (result.allowSubmission && !result.allowWrites) throw new AppStoreError('invalidConfiguration', 'Submission requires --allow-writes as well as --allow-submission.');
  return result;
}
