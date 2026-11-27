// 프레임워크 없이 동작하는 서버. 교사 비밀번호는 서버 환경변수로 설정합니다.
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const clean = (value, max) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`내용을 입력해 주세요. (최대 ${max}자)`); return value.trim(); };
const uuid = () => crypto.randomUUID();
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://*.chatgpt.com https://chatgpt.com" } });
    let cookie;
    try {
      if (!env.DB) fail('데이터베이스를 연결해 주세요.', 503);
      if (!['GET', 'POST'].includes(request.method)) fail('지원하지 않는 요청입니다.', 405);
      if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) fail('잘못된 요청입니다.', 403);
      const db = env.DB;
      const run = (sql, ...args) => db.prepare(sql).bind(...args).run();
      const one = (sql, ...args) => db.prepare(sql).bind(...args).first();
      const many = async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
      const sid = request.headers.get('Cookie')?.match(/(?:^|;\s*)mq_session=([a-f0-9-]{36})(?:;|$)/)?.[1];
      let session = sid ? await one('SELECT * FROM sessions WHERE id = ?', sid) : null;
      if (!session) {
        session = { id: uuid(), role: null, failures: 0, locked_until: 0 };
        await run('INSERT INTO sessions (id, created) VALUES (?, ?)', session.id, Date.now());
        cookie = `mq_session=${session.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${url.protocol === 'https:' ? '; Secure' : ''}`;
      }
      const out = (data, status = 200) => json(data, status, cookie ? { 'Set-Cookie': cookie } : {});
      const path = url.pathname;
      const post = request.method === 'POST';
      let body = {};
      if (post) { const raw = await request.text(); if (raw.length > 14000) fail('내용이 너무 깁니다.', 413); try { body = JSON.parse(raw || '{}'); } catch { fail('요청 형식이 올바르지 않습니다.'); } if (!body || Array.isArray(body) || typeof body !== 'object') fail('요청 형식이 올바르지 않습니다.'); }
      if (path === '/api/session' && !post) return out({ role: session.role, nickname: `익명 학생 ${session.id.slice(0, 4)}` });
      if (path === '/api/enter' && post) {
        if (!['student', 'teacher'].includes(body.role)) fail('역할을 선택해 주세요.');
        if (body.role === 'teacher') {
          if (session.locked_until > Date.now()) fail('잠시 후 다시 입력해 주세요.', 429);
          if (!env.TEACHER_PASSWORD) fail('교사 비밀번호 설정이 필요합니다.', 503);
          if (body.password !== env.TEACHER_PASSWORD) { const failures = session.failures + 1; await run('UPDATE sessions SET failures = ?, locked_until = ? WHERE id = ?', failures, failures >= 5 ? Date.now() + 60000 : 0, session.id); fail('비밀번호가 올바르지 않습니다. 다시 입력해 주세요.', 401); }
        }
        await run('UPDATE sessions SET role = ?, failures = 0, locked_until = 0 WHERE id = ?', body.role, session.id);
        return out({ role: body.role });
      }
      if (path === '/api/leave' && post) { await run('UPDATE sessions SET role = NULL WHERE id = ?', session.id); return out({ ok: true }); }
      if (!session.role) fail('먼저 학생 또는 교사를 선택해 주세요.', 401);
      if (path === '/api/posts') {
        if (!post) return out(await many('SELECT p.id, p.subject, p.title, p.body, p.created, (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count FROM posts p ORDER BY p.created DESC LIMIT 100'));
        const title = clean(body.title, 100), content = clean(body.body, 3000), subject = clean(body.subject, 20);
        if (!['국어', '영어', '수학', '과학', '사회', '기타'].includes(subject)) fail('과목을 선택해 주세요.');
        const id = uuid(); await run('INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?)', id, session.id, subject, title, content, Date.now()); return out({ id }, 201);
      }
      const postId = path.match(/^\/api\/posts\/([a-f0-9-]{36})$/)?.[1];
      if (postId) {
        const item = await one('SELECT id, subject, title, body, created FROM posts WHERE id = ?', postId); if (!item) fail('질문을 찾을 수 없습니다.', 404);
        if (post) { await run('INSERT INTO replies VALUES (?, ?, ?, ?, ?, ?)', uuid(), postId, session.id, session.role, clean(body.body, 3000), Date.now()); return out({ ok: true }, 201); }
        return out({ ...item, replies: await many('SELECT id, role, body, created FROM replies WHERE post_id = ? ORDER BY created', postId) });
      }
      if (path === '/api/threads') {
        if (post) {
          if (session.role !== 'student') fail('학생 화면에서 질문을 시작해 주세요.', 403);
          await run('INSERT OR IGNORE INTO threads (id, student, created) VALUES (?, ?, ?)', uuid(), session.id, Date.now());
          return out({ id: (await one('SELECT id FROM threads WHERE student = ?', session.id)).id });
        }
        const isTeacher = session.role === 'teacher';
        return out(await many(`SELECT t.id, t.solved, t.created, substr(t.student, 1, 4) AS nickname,
          (SELECT body FROM messages WHERE thread_id = t.id ORDER BY created DESC, rowid DESC LIMIT 1) AS last_message,
          COALESCE((SELECT MAX(created) FROM messages WHERE thread_id = t.id), t.created) AS updated,
          (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id AND m.role = ? AND m.created > t.${isTeacher ? 'teacher_read' : 'student_read'}) AS unread
          FROM threads t ${isTeacher ? '' : 'WHERE t.student = ?'} ORDER BY updated DESC`, ...(isTeacher ? ['student'] : ['teacher', session.id])));
      }
      const threadId = path.match(/^\/api\/threads\/([a-f0-9-]{36})$/)?.[1];
      if (threadId) {
        const thread = await one('SELECT * FROM threads WHERE id = ?', threadId);
        if (!thread || (session.role !== 'teacher' && thread.student !== session.id)) fail('대화에 접근할 수 없습니다.', 403);
        if (post) {
          if ('solved' in body) { if (session.role !== 'student') fail('질문한 학생만 해결 상태를 바꿀 수 있습니다.', 403); await run('UPDATE threads SET solved = ? WHERE id = ?', body.solved ? 1 : 0, threadId); }
          else await db.batch([db.prepare('INSERT INTO messages VALUES (?, ?, ?, ?, ?)').bind(uuid(), threadId, session.role, clean(body.body, 3000), Date.now()), db.prepare('UPDATE threads SET solved = 0 WHERE id = ?').bind(threadId)]);
          return out({ ok: true });
        }
        const readAt = Date.now();
        const messages = await many('SELECT id, role, body, created FROM messages WHERE thread_id = ? ORDER BY created, rowid', threadId);
        await run(`UPDATE threads SET ${session.role === 'teacher' ? 'teacher_read' : 'student_read'} = ? WHERE id = ?`, readAt, threadId);
        return out({ id: thread.id, nickname: thread.student.slice(0, 4), solved: !!thread.solved, messages });
      }
      fail('페이지를 찾을 수 없습니다.', 404);
    } catch (error) {
      if (!error.status) console.error('API error', error.message);
      return json({ error: error.status ? error.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, error.status || 500, cookie ? { 'Set-Cookie': cookie } : {});
    }
  }
};
