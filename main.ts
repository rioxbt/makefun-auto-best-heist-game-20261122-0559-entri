// Velvet Vault hands itself in from here.
//
// The grader runs this file twice in a sandbox with no network, a read-only /bot (this repository at
// the entered commit) and a writable /output, and both runs must write the same bytes. So the job is
// small and entirely deterministic:
//
//   1. look over this repository and refuse to hand in anything the gate would refuse (no game/, no
//      game/index.html, no screenshots/, not 3 or 4 images, an image over 256 KiB),
//   2. copy game/ and screenshots/ under the output directory,
//   3. write output/dossier.json with the kit's own buildDossier, byte for byte, so the gate's
//      dossier_matches row finds the library's own bytes,
//   4. print what was handed in, which is what a human reads in the run log.
//
// Outside the grader MAKEFUN_OUTPUT_DIR stands in for /output:
//     mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The caps handed to buildDossier are the scorer's own (reference/gate.json). Only text_max_bytes
// changes the bytes written; the rest refuse an entry the scorer would refuse, here rather than in
// the grader.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const GAME_DIR = join(ROOT, 'game');
const SCREENSHOT_DIR = join(ROOT, 'screenshots');

/** The scorer's caps, stated once. */
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const IMAGE_SUFFIXES = ['.png', '.jpg', '.jpeg'];

function fail(message) {
  process.stderr.write(`velvet-vault: ${message}\n`);
  process.exit(1);
}

/** Everything this program checks on its own before it copies a single file. */
function inspectSource() {
  if (!existsSync(GAME_DIR) || !statSync(GAME_DIR).isDirectory()) fail('game/ is missing beside main.ts');
  const index = join(GAME_DIR, 'index.html');
  if (!existsSync(index) || !statSync(index).isFile()) fail('game/index.html is missing');
  if (statSync(index).size > 1024 * 1024) fail('game/index.html is larger than 1 MiB');
  if (!existsSync(SCREENSHOT_DIR) || !statSync(SCREENSHOT_DIR).isDirectory()) fail('screenshots/ is missing beside main.ts');

  const names = readdirSync(SCREENSHOT_DIR).filter((name) => !name.startsWith('.'));
  const images = names.filter((name) => IMAGE_SUFFIXES.includes(name.slice(name.lastIndexOf('.')).toLowerCase()));
  if (images.length < 3 || images.length > CAPS.screenshots.max) {
    fail(`screenshots/ holds ${images.length} images; the gate wants 3 or 4`);
  }
  for (const name of images) {
    const size = statSync(join(SCREENSHOT_DIR, name)).size;
    if (size > CAPS.screenshots.max_bytes) fail(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
  }
  return images.sort();
}

/** Copy one directory under the output, and count what went. */
function copyInto(destination, from, label) {
  if (!existsSync(from)) return 0;
  cpSync(from, destination, { recursive: true });
  let count = 0;
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(directory, entry.name));
      else count += 1;
    }
  };
  walk(destination);
  process.stdout.write(`  copied ${label}: ${count} files\n`);
  return count;
}

const shots = inspectSource();
mkdirSync(OUT_DIR, { recursive: true });

process.stdout.write(`Velvet Vault, into ${OUT_DIR}\n`);
copyInto(join(OUT_DIR, 'game'), GAME_DIR, 'game/');
copyInto(join(OUT_DIR, 'screenshots'), SCREENSHOT_DIR, 'screenshots/');

const dossier = join(OUT_DIR, 'dossier.json');
writeFileSync(dossier, buildDossier(OUT_DIR, CAPS));
process.stdout.write(`  wrote ${dossier}: ${statSync(dossier).size} bytes\n`);
process.stdout.write(`  cover screenshot: ${shots[0]}\n`);
process.stdout.write('handed in\n');
