/**
 * The versions of the DZIF core dataset that ship with the app.
 *
 * `public/odm/versions.json` lists them, newest first. Adding a version means
 * dropping the ODM file into `public/odm/` and adding one entry — no code change.
 * `versions.test.ts` verifies that every entry resolves to a readable ODM file whose
 * `CreationDateTime` matches the `created` date in the manifest.
 */

export interface OdmVersion {
  /** The id under which DZIF publishes the version, e.g. `46192`. */
  id: string;
  /** File name inside `public/odm/`. */
  file: string;
  /** Creation date of the ODM file, `YYYY-MM-DD`. */
  created: string;
  /** Entry in the Medical Data Models portal, if published there. */
  mdmUrl?: string;
}

export interface VersionManifest {
  versions: OdmVersion[];
}

export class VersionError extends Error {}

function isVersion(value: unknown): value is OdmVersion {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    entry.id !== '' &&
    typeof entry.file === 'string' &&
    entry.file !== '' &&
    typeof entry.created === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.created)
  );
}

/** Validate a parsed `versions.json`, newest first. */
export function parseVersionManifest(value: unknown): OdmVersion[] {
  if (typeof value !== 'object' || value === null || !Array.isArray((value as VersionManifest).versions)) {
    throw new VersionError('versions.json does not contain a "versions" array.');
  }
  const versions = (value as VersionManifest).versions.filter(isVersion);
  if (versions.length === 0) {
    throw new VersionError('versions.json lists no usable version.');
  }
  const seen = new Set<string>();
  for (const version of versions) {
    if (seen.has(version.id)) throw new VersionError(`Duplicate version id "${version.id}".`);
    seen.add(version.id);
    // A file name that could escape the folder must never reach a fetch URL.
    if (/[\\/]|\.\./.test(version.file)) {
      throw new VersionError(`Version "${version.id}" has an unusable file name.`);
    }
  }
  return [...versions].sort((a, b) => b.created.localeCompare(a.created));
}

/** The version to start with: the newest one. */
export function newestVersion(versions: OdmVersion[]): OdmVersion {
  const newest = versions[0];
  if (!newest) throw new VersionError('No version available.');
  return newest;
}

export function findVersion(versions: OdmVersion[], id: string | null): OdmVersion | undefined {
  if (id === null) return undefined;
  return versions.find((version) => version.id === id);
}
