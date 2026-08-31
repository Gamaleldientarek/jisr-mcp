/**
 * Release consistency gate (spec FR-044, FR-044a).
 *
 * Runs before publish. Asserts that the tag, the package version, the changelog
 * entry, and the documented protocol and snapshot versions all agree.
 *
 * The failure this prevents: a release that claims one Jisr snapshot in its
 * notes while the build was verified against another. An adopter reading the
 * notes would have no way to know.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SNAPSHOT_VERSION } from '../src/core/jisr/endpoint-manifest.js';

const ROOT = process.cwd();
const problems: string[] = [];

function require_(condition: boolean, message: string): void {
  if (!condition) problems.push(message);
}

async function main(): Promise<void> {
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')) as {
    version: string;
    name: string;
    private?: boolean;
    license?: string;
  };
  const changelog = await readFile(resolve(ROOT, 'CHANGELOG.md'), 'utf8');
  const releaseTemplate = await readFile(resolve(ROOT, '.github/release-template.md'), 'utf8');

  // The tag drives the release, so it is the source of truth for the version.
  const tag = process.env['GITHUB_REF_NAME'] ?? process.argv[2];
  if (tag !== undefined) {
    require_(
      tag === 'v' + pkg.version,
      'tag ' + tag + ' does not match package.json version ' + pkg.version,
    );
  }

  require_(
    /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(pkg.version),
    'version ' + pkg.version + ' is not semantic',
  );

  require_(
    changelog.includes('[' + pkg.version + ']') || changelog.includes('## ' + pkg.version),
    'CHANGELOG.md has no entry for ' + pkg.version,
  );

  // The snapshot the build was verified against must be the one the notes claim.
  require_(
    releaseTemplate.includes(SNAPSHOT_VERSION),
    'the release template does not name snapshot ' + SNAPSHOT_VERSION,
  );

  require_(
    releaseTemplate.includes('2026-07-28') && releaseTemplate.includes('2025-11-25'),
    'the release template does not name both supported MCP protocol revisions',
  );

  // Two release targets share this gate. A GitHub release ships no package, so
  // private:true is fine there -- it is what PREVENTS an accidental npm publish.
  // For an npm release it is a blocker. Default is the strict target.
  const target = process.env['RELEASE_TARGET'] ?? 'npm';
  require_(
    pkg.license !== undefined && pkg.license !== 'UNLICENSED',
    'package.json has no license; nothing may be released without one',
  );
  if (target === 'npm') {
    require_(pkg.private !== true, 'package.json still has private: true');
  }

  if (problems.length > 0) {
    console.error('Release verification FAILED:');
    for (const problem of problems) console.error('  - ' + problem);
    process.exit(1);
  }

  console.log(
    'Release verification passed for ' + pkg.name + '@' + pkg.version + ' (target: ' + target + ')',
  );
  console.log('  Jisr snapshot: ' + SNAPSHOT_VERSION);
  console.log('  MCP protocols: 2026-07-28, 2025-11-25');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
