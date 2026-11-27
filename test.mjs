import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localDB } from './local-db.mjs';
import worker from './dist/server/index.js';
test('학생 바로 입장, 교사 인증, 게시판 답변, 다른 사용자와 DM, 접근 제한', async () => {
  const DB = localDB(); DB.exec(readFileSync('schema.sql', 'utf8'));
  const env = { DB, TEACHER_PASSWORD: 'teacher-test' }, origin = 'https://example.test';
  function client() {
    let cookie = '';
    return async (path, data) => {
      const response = await worker.fetch(new Request(origin + '/api/' + path, { method: data === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) }), env);
      if (response.headers.get('Set-Cookie')) cookie = response.headers.get('Set-Cookie').split(';')[0];
      return { status: response.status, data: await response.json() };
    };
  }
  const student = client(), teacher = client(), stranger = client();
  assert.equal((await student('session')).data.role, null);
  assert.equal((await student('threads')).status, 401);
  assert.equal((await student('enter', { role: 'student' })).status, 200);
  assert.equal((await teacher('enter', { role: 'teacher', password: 'wrong' })).status, 401);
  assert.equal((await teacher('threads')).status, 401);
  assert.equal((await teacher('enter', { role: 'teacher', password: 'teacher-test' })).status, 200);
  const thread = (await student('threads', {})).data.id;
  assert.equal((await student('threads', {})).data.id, thread);
  await student('threads/' + thread, { body: '이차방정식을 설명해 주세요.' });
  const received = (await teacher('threads')).data;
  assert.equal(received[0].unread, 1);
  assert.equal((await teacher('threads/' + thread)).data.messages[0].body, '이차방정식을 설명해 주세요.');
  await teacher('threads/' + thread, { body: '인수분해부터 함께 해 볼까요?' });
  const chat = (await student('threads/' + thread)).data;
  assert.equal(chat.messages.length, 2); assert.equal(chat.messages[1].role, 'teacher');
  assert.equal((await teacher('threads/' + thread, { solved: true })).status, 403);
  await student('threads/' + thread, { solved: true }); assert.equal((await student('threads/' + thread)).data.solved, true);
  await stranger('enter', { role: 'student' });
  assert.equal((await stranger('threads')).data.length, 0);
  assert.equal((await stranger('threads/' + thread)).status, 403);
  assert.equal((await stranger('threads/' + thread, { body: '침입' })).status, 403);
  const post = (await student('posts', { subject: '수학', title: '근의 공식', body: '<script>질문</script>' })).data.id;
  assert.equal((await teacher('posts/' + post, { body: '함께 풀어요.' })).status, 201);
  assert.equal((await student('posts/' + post)).data.replies[0].role, 'teacher');
  await teacher('leave', {}); assert.equal((await teacher('threads')).status, 401);
  assert.equal((await student('posts', { subject: '없는 과목', title: '제목', body: '내용' })).status, 400);
  const cross = await worker.fetch(new Request(origin + '/api/enter', { method: 'POST', headers: { Origin: 'https://other.test' }, body: JSON.stringify({ role: 'student' }) }), env);
  assert.equal(cross.status, 403);
  DB.close();
});
