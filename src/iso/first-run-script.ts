/**
 * Build a Raspberry Pi Imager `--first-run-script` (firstrun.sh) that writes
 * Cleep payload JSON files onto the FAT boot partition on first boot.
 *
 * Filenames follow `cleep-<app>.json` where `<app>` is the consumer module
 * (e.g. cleep-network.json). Extra payloads can be added later in the same script.
 */

const PAYLOAD_FILENAME_PATTERN = /^cleep-[a-z0-9][a-z0-9_-]*\.json$/i;

export interface FirstRunPayloadFile {
  /** Basename written next to firstrun.sh on the boot partition. */
  filename: string;
  /** JSON-serializable payload consumed by the matching Cleep app. */
  content: unknown;
}

export function assertPayloadFilename(filename: string): void {
  if (!PAYLOAD_FILENAME_PATTERN.test(filename)) {
    throw new Error(
      `Invalid first-run payload filename "${filename}" (expected cleep-<app>.json)`,
    );
  }
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error(`Unsafe first-run payload filename "${filename}"`);
  }
}

/**
 * Build firstrun.sh contents (LF endings). Runs on the device under systemd.run.
 */
export function buildFirstRunScript(files: FirstRunPayloadFile[]): string {
  if (!files.length) {
    throw new Error('first-run script requires at least one payload file');
  }

  const lines: string[] = [
    '#!/bin/bash',
    'set +e',
    '',
    'SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"',
    '',
  ];

  for (const file of files) {
    assertPayloadFilename(file.filename);
    const delimiter = `CLEEP_EOF_${file.filename.replace(/[^a-zA-Z0-9]/g, '_')}`;
    lines.push(`cat > "$SCRIPT_DIR/${file.filename}" <<'${delimiter}'`);
    lines.push(JSON.stringify(file.content));
    lines.push(delimiter);
    lines.push('');
  }

  // Match Raspberry Pi Imager cleanup so systemd.run does not loop after reboot.
  lines.push('rm -f "$0"');
  lines.push('if [ -f "$SCRIPT_DIR/cmdline.txt" ]; then');
  lines.push("  sed -i 's| systemd.run.*||g' \"$SCRIPT_DIR/cmdline.txt\"");
  lines.push('fi');
  lines.push('exit 0');
  lines.push('');

  return lines.join('\n');
}
