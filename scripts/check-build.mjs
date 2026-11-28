import { access, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
await access(join(dist, 'index.html'));
await access(join(dist, 'redroid.html'));
const v86Dir = join(dist, 'v86');
const files = (await readdir(v86Dir)).filter(name => /^v86.*\.wasm$/.test(name));
if (!files.length) throw new Error('Production build is missing the v86 WebAssembly runtime in dist/v86/.');
for (const file of files) {
  const info = await stat(join(v86Dir, file));
  if (info.size === 0) throw new Error('Empty v86 WebAssembly asset: ' + file);
}
console.log('Production boot assets verified:', files.join(', '));
