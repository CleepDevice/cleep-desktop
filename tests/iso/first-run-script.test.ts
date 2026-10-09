import { describe, expect, it } from 'vitest';
import { assertPayloadFilename, buildFirstRunScript } from '../../src/iso/first-run-script';

describe('first-run-script', () => {
  it('builds a script that writes cleep-network.json and cleans cmdline', () => {
    const script = buildFirstRunScript([
      {
        filename: 'cleep-network.json',
        content: {
          network: 'Home',
          password: 'p$ass"word',
          encryption: 'wpa2',
          hidden: false,
        },
      },
    ]);

    expect(script.startsWith('#!/bin/bash\n')).toBe(true);
    expect(script).toContain('cat > "$SCRIPT_DIR/cleep-network.json"');
    expect(script).toContain(
      '{"network":"Home","password":"p$ass\\"word","encryption":"wpa2","hidden":false}',
    );
    expect(script).toContain('rm -f "$0"');
    expect(script).toContain('cmdline.txt');
    // Quoted heredoc must not expand shell metacharacters in the password.
    expect(script).toMatch(/<<'CLEEP_EOF_cleep_network_json'/);
  });

  it('supports multiple cleep-*.json payloads in one script', () => {
    const script = buildFirstRunScript([
      { filename: 'cleep-network.json', content: { network: 'a' } },
      { filename: 'cleep-update.json', content: { channel: 'stable' } },
    ]);

    expect(script).toContain('cleep-network.json');
    expect(script).toContain('cleep-update.json');
    expect(script).toContain('"channel":"stable"');
  });

  it('rejects unsafe or non-cleep payload filenames', () => {
    expect(() => assertPayloadFilename('../etc/passwd')).toThrow(/Invalid|Unsafe/);
    expect(() => assertPayloadFilename('network.json')).toThrow(/Invalid/);
    expect(() =>
      buildFirstRunScript([{ filename: 'not-cleep.json', content: {} }]),
    ).toThrow(/Invalid/);
  });

  it('requires at least one payload', () => {
    expect(() => buildFirstRunScript([])).toThrow(/at least one/);
  });
});
