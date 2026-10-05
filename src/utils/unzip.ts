import { Open } from 'unzipper';

export async function extractZipArchive(sourcePath: string, destinationPath: string): Promise<void> {
  const directory = await Open.file(sourcePath);
  await directory.extract({ path: destinationPath });
}
