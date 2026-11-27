const $ = id => document.getElementById(id);
const state = { role: null, page: 'board', posts: [], subject: '전체', thread: null, threads: [], detail: null, messages: '', polling: false, nickname: '', generation: 0 };
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = value => new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4200); }
async function api(path, data) {
  const response = await fetch('/api/' + path, { method: data === undefined ? 'GET' : 'POST', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '요청을 처리하지 못했습니다.');
  return result;
}
async function busy(button, task) { if (button.disabled) return; button.disabled = true; try { await task(); } catch (error) { toast(error.message); } finally { button.disabled = false; } }
async function enter(role, password) {
  const result = await api('enter', { role, password }); state.role = result.role; state.generation++; showApp(); await loadBoard(); await loadThreads();
}
function showApp() {
  $('loading').hidden = true; $('welcome').hidden = !!state.role; $('app').hidden = !state.role;
  if (!state.role) return;
  const teacher = state.role === 'teacher';
  $('user-name').textContent = teacher ? '물음표 선생님' : state.nickname;
  $('user-avatar').textContent = teacher ? '선' : '학'; $('user-role').textContent = teacher ? '교사 공간' : '학생 공간';
  $('dm-nav-label').textContent = teacher ? '받은 1:1 질문' : '선생님과 1:1 질문';
  $('dm-title').textContent = teacher ? '받은 1:1 질문' : '선생님과 1:1 질문';
  $('dm-description').textContent = teacher ? '학생의 작은 궁금증에, 따뜻한 설명을 더해 주세요.' : '다른 친구에게는 보이지 않는, 나와 선생님만의 대화.';
  $('new-dm').hidden = teacher; $('conversation-title').textContent = teacher ? '학생들의 대화' : '내 대화';
  $('banner-dm').textContent = teacher ? '받은 질문 확인하기' : '선생님께 질문하기';
  $('solve').hidden = teacher;
}
function showPage(page) {
  state.page = page; $('board-page').hidden = page !== 'board'; $('dm-page').hidden = page !== 'dm';
  document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('breadcrumb').textContent = '우리 학교 / ' + (page === 'board' ? '공부 고민 게시판' : $('dm-title').textContent);
  if (page === 'dm') loadThreads().catch(e => toast(e.message));
}
async function loadBoard() { const generation = state.generation; const posts = await api('posts'); if (generation !== state.generation) return; state.posts = posts; renderPosts(); }
function renderPosts() {
  const query = $('search').value.trim().toLowerCase();
  const posts = state.posts.filter(p => (state.subject === '전체' || p.subject === state.subject) && (p.title + ' ' + p.body).toLowerCase().includes(query));
  $('post-count').textContent = posts.length;
  $('post-list').innerHTML = posts.length ? posts.map(p => `<button class="post-card" data-post="${p.id}"><div class="post-top"><span class="subject-tag">${escapeHTML(p.subject)}</span></div><h3>${escapeHTML(p.title)}</h3><p>${escapeHTML(p.body)}</p><div class="post-meta"><span>익명 · ${time(p.created)}</span><span>답변 ${p.reply_count}</span></div></button>`).join('') : `<div class="post-empty"><span class="empty-icon">?</span><h3>${query || state.subject !== '전체' ? '아직 찾는 질문이 없어요.' : '첫 질문을 기다리고 있어요.'}</h3><p>작은 궁금증도 좋아요. 함께 생각해 볼까요?</p><button class="btn subtle" id="empty-write">첫 질문 올리기</button></div>`;
}
async function openDetail(id, show = true) {
  const post = await api('posts/' + id); state.detail = id;
  $('detail-subject').textContent = post.subject; $('detail-title').textContent = post.title; $('detail-body').textContent = post.body;
  $('replies').innerHTML = post.replies.length ? post.replies.map(r => `<div class="reply"><strong>${r.role === 'teacher' ? '물음표 선생님 · 교사 답변' : '도움 주는 익명 친구'}</strong><p class="preserve">${escapeHTML(r.body)}</p><time>${time(r.created)}</time></div>`).join('') : '<p class="muted">아직 답변이 없어요. 첫 설명을 남겨 주세요.</p>';
  if (show && !$('detail-dialog').open) { $('reply-input').value = ''; $('detail-dialog').showModal(); }
}
async function loadThreads() {
  const generation = state.generation, threads = await api('threads'); if (generation !== state.generation) return;
  state.threads = threads;
  const unread = threads.reduce((sum, t) => sum + t.unread, 0); $('unread-badge').textContent = unread > 99 ? '99+' : unread; $('unread-badge').hidden = !unread;
  $('thread-list').innerHTML = threads.length ? threads.map(t => `<button class="thread-btn ${t.id === state.thread ? 'active' : ''}" data-thread="${t.id}"><strong>${state.role === 'teacher' ? '익명 학생 ' + escapeHTML(t.nickname) : '물음표 선생님'}</strong>${t.unread ? `<b class="badge">${t.unread}</b>` : ''}<p>${t.solved ? '✓ 해결됨 · ' : ''}${escapeHTML(t.last_message || '첫 질문을 남겨 보세요.')}</p></button>`).join('') : '<p class="muted" style="padding:8px 18px 20px;font-size:.8125rem">아직 시작한 대화가 없어요.</p>';
}
async function openThread(id) {
  if (state.thread !== id) { state.thread = id; state.messages = ''; $('message-input').value = ''; $('chat-content').hidden = true; $('chat-empty').hidden = false; }
  await loadChat(); await loadThreads();
}
async function loadChat() {
  if (!state.thread) return;
  const id = state.thread, generation = state.generation, data = await api('threads/' + id);
  if (id !== state.thread || generation !== state.generation) return;
  $('chat-empty').hidden = true; $('chat-content').hidden = false;
  $('chat-name').textContent = state.role === 'teacher' ? '익명 학생 ' + data.nickname : '물음표 선생님';
  $('solve').textContent = data.solved ? '아직 어려워요' : '해결됐어요'; $('solve').dataset.solved = String(data.solved);
  $('solved-state').hidden = !data.solved;
  const signature = JSON.stringify(data.messages);
  if (signature !== state.messages) {
    const box = $('messages'), nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 100;
    box.innerHTML = data.messages.length ? data.messages.map(m => `<div class="message ${m.role === state.role ? 'mine' : ''}"><span class="message-label">${m.role === 'teacher' ? '물음표 선생님' : '익명 학생'}</span><div class="message-bubble">${escapeHTML(m.body)}</div><time>${time(m.created)}</time></div>`).join('') : '<p class="muted" style="text-align:center;font-size:.875rem;margin:auto">첫 질문을 보내 보세요.<br>어느 부분이 어려운지 편하게 알려 주세요.</p>';
    if (nearBottom || !state.messages) box.scrollTop = box.scrollHeight;
    state.messages = signature;
  }
}
async function beginDM() { const data = await api('threads', {}); await openThread(data.id); $('message-input').focus(); }
$('student-enter').onclick = e => busy(e.currentTarget, () => enter('student'));
$('teacher-open').onclick = () => { $('teacher-form').hidden = !$('teacher-form').hidden; if (!$('teacher-form').hidden) $('password').focus(); };
$('teacher-form').onsubmit = async e => { e.preventDefault(); $('password-error').textContent = ''; await busy(e.submitter, async () => { try { await enter('teacher', $('password').value); $('password').value = ''; } catch (error) { $('password-error').textContent = error.message; } }); };
$('leave').onclick = e => busy(e.currentTarget, async () => { await api('leave', {}); state.role = null; state.generation++; state.thread = null; state.messages = ''; state.threads = []; showPage('board'); $('chat-empty').hidden = false; $('chat-content').hidden = true; $('thread-list').innerHTML = ''; $('messages').innerHTML = ''; $('message-input').value = ''; $('reply-input').value = ''; $('post-form').reset(); $('teacher-form').reset(); $('teacher-form').hidden = true; $('password-error').textContent = ''; document.querySelectorAll('dialog[open]').forEach(d => d.close()); showApp(); });
document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => showPage(b.dataset.page));
$('banner-dm').onclick = async () => { showPage('dm'); if (state.role === 'student') await busy($('banner-dm'), beginDM); };
$('new-dm').onclick = e => busy(e.currentTarget, beginDM);
$('write-open').onclick = () => $('write-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).close());
$('filters').onclick = e => { const b = e.target.closest('[data-subject]'); if (!b) return; state.subject = b.dataset.subject; document.querySelectorAll('[data-subject]').forEach(c => c.classList.toggle('active', c === b)); renderPosts(); };
$('search').oninput = renderPosts;
$('post-list').onclick = async e => { const b = e.target.closest('[data-post]'); if (b) await busy(b, () => openDetail(b.dataset.post)); if (e.target.closest('#empty-write')) $('write-dialog').showModal(); };
$('post-form').onsubmit = e => { e.preventDefault(); busy(e.submitter, async () => { await api('posts', { subject: $('post-subject').value, title: $('post-title').value, body: $('post-body').value }); $('write-dialog').close(); e.target.reset(); await loadBoard(); toast('질문을 등록했어요.'); }); };
$('reply-form').onsubmit = e => { e.preventDefault(); busy(e.submitter, async () => { await api('posts/' + state.detail, { body: $('reply-input').value }); $('reply-input').value = ''; await openDetail(state.detail, false); await loadBoard(); toast('답변을 등록했어요.'); }); };
$('thread-list').onclick = e => { const b = e.target.closest('[data-thread]'); if (b) busy(b, () => openThread(b.dataset.thread)); };
$('message-form').onsubmit = e => { e.preventDefault(); busy(e.submitter, async () => { const input = $('message-input'), text = input.value; await api('threads/' + state.thread, { body: text }); if (input.value === text) input.value = ''; await loadChat(); $('messages').scrollTop = $('messages').scrollHeight; await loadThreads(); input.focus(); }); };
$('message-input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if ($('message-input').value.trim() && !$('message-form').querySelector('button').disabled) $('message-form').requestSubmit($('message-form').querySelector('button')); } };
$('solve').onclick = e => busy(e.currentTarget, async () => { await api('threads/' + state.thread, { solved: $('solve').dataset.solved !== 'true' }); await loadChat(); await loadThreads(); });
setInterval(async () => {
  if (!state.role || document.hidden || state.polling) return;
  state.polling = true;
  try { if (state.page === 'dm' && state.thread) await loadChat(); await loadThreads(); } catch { /* 전송되지 않은 초안은 유지하고, 다음 주기에 다시 연결합니다. */ } finally { state.polling = false; }
}, 4000);
(async () => {
  try { const data = await api('session'); state.role = data.role; state.nickname = data.nickname; showApp(); if (state.role) { await loadBoard(); await loadThreads(); } }
  catch (error) { $('loading').textContent = '연결하지 못했어요. 새로고침해 다시 시도해 주세요.'; toast(error.message); }
})();
