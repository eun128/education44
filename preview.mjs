import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { localDB } from './local-db.mjs';
import worker from './dist/server/index.js';
if (!process.env.TEACHER_PASSWORD) throw new Error('TEACHER_PASSWORD 환경변수를 설정해 주세요.');
mkdirSync('.local', { recursive: true });
const DB = localDB('.local/data.sqlite');
if (!DB.exec) throw new Error('데이터베이스를 열지 못했습니다.');
// 로컬 최초 실행에만 스키마를 적용합니다. 배포 시에는 정식 마이그레이션을 사용합니다.
if (!await DB.prepare("SELECT name FROM sqlite_master WHERE name = 'sessions'").first()) DB.exec(readFileSync('schema.sql', 'utf8'));
createServer(async (incoming, outgoing) => {
  try {
    const base = 'http://' + incoming.headers.host;
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const request = new Request(new URL(incoming.url, base), { method: incoming.method, headers: incoming.headers, ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Buffer.concat(chunks) } : {}) });
    const response = await worker.fetch(request, { DB, TEACHER_PASSWORD: process.env.TEACHER_PASSWORD });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { console.error(error); outgoing.writeHead(500); outgoing.end('서버 오류'); }
}).listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173'));
