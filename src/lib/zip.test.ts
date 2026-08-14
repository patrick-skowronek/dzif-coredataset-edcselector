import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, createZip } from './zip';

describe('zip writer', () => {
  it('computes CRC-32 as specified', () => {
    // The standard CRC-32 of "123456789" is 0xCBF43926.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('writes an archive that the system unzip can read', () => {
    const entries = [
      { name: 'a.csv', content: 'one,two\r\n1,2\r\n' },
      { name: 'ümlaut.txt', content: 'Grüße aus Heidelberg\n' },
    ];
    const zip = createZip(entries, new Date(2026, 0, 2, 3, 4, 6));
    const directory = mkdtempSync(join(tmpdir(), 'dzif-zip-'));
    const path = join(directory, 'test.zip');
    writeFileSync(path, zip);

    const listing = execFileSync('unzip', ['-l', path], { encoding: 'utf8' });
    expect(listing).toContain('a.csv');
    // `unzip -t` fails on a CRC or structural error.
    expect(() => execFileSync('unzip', ['-t', path], { encoding: 'utf8' })).not.toThrow();

    // Read the entries back with a reader that honours the UTF-8 name flag.
    // (Info-ZIP's `unzip` predates it and rewrites non-ASCII names on extraction.)
    const dumped = execFileSync(
      'python3',
      [
        '-c',
        'import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n z.testzip()\n print(json.dumps({n: z.read(n).decode("utf-8") for n in z.namelist()}))',
        path,
      ],
      { encoding: 'utf8' },
    );
    const contents = JSON.parse(dumped) as Record<string, string>;
    expect(Object.keys(contents)).toEqual(entries.map((entry) => entry.name));
    for (const entry of entries) {
      expect(contents[entry.name], entry.name).toBe(entry.content);
    }
  });

  it('handles an empty archive', () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22); // just the end-of-central-directory record
  });
});
