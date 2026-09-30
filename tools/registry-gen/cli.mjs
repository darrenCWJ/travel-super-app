/**
 * The root postinstall's entry point: writes the generated registries for this
 * checkout. Plain Node with built-ins only, so it runs before anything else
 * installed is known to work (this machine, CI, Vercel, EAS).
 */
import { fileURLToPath } from 'node:url';
import { writeRegistry } from './generate.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { written } = writeRegistry(root);
for (const rel of written) console.log(`registry-gen: wrote ${rel}`);
