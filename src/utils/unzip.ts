import fs from 'fs';
import path from 'path';
import { Open } from 'unzipper';

/**
 * Extract a zip and restore Unix permission bits from the central directory.
 * `unzipper`'s extract() writes files as 0644 by default, which breaks packaged binaries.
 */
export async function extractZipArchive(sourcePath: string, destinationPath: string): Promise<void> {
  const directory = await Open.file(sourcePath);
  await directory.extract({ path: destinationPath });

  for (const entry of directory.files) {
    if (entry.type === 'Directory') {
      continue;
    }

    const mode = (entry.externalFileAttributes >>> 16) & 0o777;
    if ((mode & 0o111) === 0) {
      continue;
    }

    const targetPath = path.join(destinationPath, entry.path);
    try {
      if (fs.existsSync(targetPath)) {
        fs.chmodSync(targetPath, mode);
      }
    } catch {
      // ignore chmod failures on exotic entries
    }
  }
}
