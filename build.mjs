import { readFile, mkdir, writeFile, cp } from 'node:fs/promises';
const html = (await readFile('web/index.html', 'utf8')).replace('/* INLINE_CSS */', await readFile('web/style.css', 'utf8')).replace('/* INLINE_JS */', await readFile('web/app.js', 'utf8'));
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await writeFile('dist/server/index.js', `const HTML = ${JSON.stringify(html)};\n${await readFile('worker.mjs', 'utf8')}`);
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
await cp('drizzle', 'dist/.openai/drizzle', { recursive: true });
console.log('Build ready: dist/server/index.js');
