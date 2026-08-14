import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOdmString } from './parse';
import { findVersion, newestVersion, parseVersionManifest } from './versions';

const ODM_DIR = resolve(import.meta.dirname, '../../../public/odm');

function manifest() {
  return parseVersionManifest(
    JSON.parse(readFileSync(resolve(ODM_DIR, 'versions.json'), 'utf8')) as unknown,
  );
}

describe('the shipped version manifest', () => {
  it('lists the versions newest first', () => {
    const versions = manifest();
    expect(versions.map((version) => version.id)).toEqual(['46192', '46190']);
    expect(newestVersion(versions).id).toBe('46192');
  });

  it('points every entry at a readable ODM file whose date matches', () => {
    for (const version of manifest()) {
      const xml = readFileSync(resolve(ODM_DIR, version.file), 'utf8');
      const model = parseOdmString(xml);
      expect(model.creationDateTime?.slice(0, 10), version.file).toBe(version.created);
      expect(model.studyName, version.file).toContain(version.id);
      expect(model.itemNodeIds.length, version.file).toBeGreaterThan(0);
    }
  });

  it('finds a version by id', () => {
    const versions = manifest();
    expect(findVersion(versions, '46190')?.file).toBe('46190_DZIF-Kerndatensatz.xml');
    expect(findVersion(versions, 'nope')).toBeUndefined();
    expect(findVersion(versions, null)).toBeUndefined();
  });
});

describe('manifest validation', () => {
  it('rejects a manifest without usable entries', () => {
    expect(() => parseVersionManifest({})).toThrow(/versions" array/);
    expect(() => parseVersionManifest({ versions: [] })).toThrow(/no usable version/);
    expect(() => parseVersionManifest({ versions: [{ id: 'a', file: 'a.xml' }] })).toThrow(
      /no usable version/,
    );
  });

  it('rejects duplicate ids and file names that could escape the folder', () => {
    const entry = { id: '1', file: 'a.xml', created: '2025-01-01' };
    expect(() => parseVersionManifest({ versions: [entry, { ...entry }] })).toThrow(/Duplicate/);
    expect(() =>
      parseVersionManifest({ versions: [{ ...entry, file: '../secret.xml' }] }),
    ).toThrow(/unusable file name/);
    expect(() =>
      parseVersionManifest({ versions: [{ ...entry, file: 'sub/dir.xml' }] }),
    ).toThrow(/unusable file name/);
  });

  it('sorts by date regardless of the order in the file', () => {
    const versions = parseVersionManifest({
      versions: [
        { id: 'old', file: 'old.xml', created: '2024-01-01' },
        { id: 'new', file: 'new.xml', created: '2026-01-01' },
      ],
    });
    expect(versions.map((version) => version.id)).toEqual(['new', 'old']);
  });
});

describe('the older version 46190', () => {
  const model = parseOdmString(
    readFileSync(resolve(ODM_DIR, '46190_DZIF-Kerndatensatz.xml'), 'utf8'),
  );

  it('parses with its own counts', () => {
    expect(model.studyName).toBe('46190_DZIF-Kerndatensatz');
    expect(model.creationDateTime?.slice(0, 10)).toBe('2025-05-16');
    expect(model.itemDefs.size).toBe(822);
    expect(model.formDefs.size).toBe(19);
    expect(model.conditions.size).toBe(838);
    expect(model.languages).toEqual(['de', 'en']);
  });

  it('falls back to the ODM Mandatory flag, because it has no * marker', () => {
    // The `*` convention was introduced with 46192; without it the preset would
    // otherwise select nothing at all.
    expect(model.coreRule).toBe('mandatory');
    const items = model.itemNodeIds
      .map((id) => model.nodesById.get(id)!)
      .filter((node): node is Extract<typeof node, { kind: 'item' }> => node.kind === 'item');
    expect(items.filter((node) => node.core)).toHaveLength(355);
    expect(items.every((node) => !node.coreMarkerInconsistent)).toBe(true);
  });

  it('parses every formal expression, as the newer version does', () => {
    expect([...model.conditions.values()].filter((condition) => !condition.ast)).toEqual([]);
  });
});
