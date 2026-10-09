import fs from 'fs';
import path from 'path';
import { Open } from 'unzipper';
import { resolvePathInside } from './safe-path';

/**
 * Extract a zip and restore Unix permission bits from the central directory.
 * `unzipper`'s extract() writes files as 0644 by default, which breaks packaged binaries.
 * Entry paths are constrained under `destinationPath` (zip-slip safe).
 */
export async function extractZipArchive(sourcePath: string, destinationPath: string): Promise<void> {
  const destinationRoot = path.normalize(destinationPath);
  if (!path.isAbsolute(destinationRoot)) {
    throw new Error('Zip destination must be an absolute path');
  }

  const directory = await Open.file(sourcePath);

  // Reject unsafe entries before writing anything to disk.
  for (const entry of directory.files) {
    resolvePathInside(destinationRoot, entry.path);
  }

  await directory.extract({ path: destinationRoot });

  for (const entry of directory.files) {
    if (entry.type === 'Directory') {
      continue;
    }

    const mode = (entry.externalFileAttributes >>> 16) & 0o777;
    if ((mode & 0o111) === 0) {
      continue;
    }

    const targetPath = resolvePathInside(destinationRoot, entry.path);
    try {
      if (fs.existsSync(targetPath)) {
        fs.chmodSync(targetPath, mode);
      }
    } catch {
      // ignore chmod failures on exotic entries
    }
  }
}
