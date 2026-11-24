/* The bell in the header: real notifications (real session only). Needs dashboard-data.js.
   All text goes in via textContent. The list refreshes every minute while the tab is visible. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el; const get = G.api.get; const send = G.api.send;

    const NAV = { 'course-detail': 'courses', 't-course-edit': 't-courses', vazifalar: 'vazifalar', jamoalar: 'jamoalar' };
    function ago(v) {
        const t = new Date(v).getTime(); if (isNaN(t)) return '';
        const m = Math.max(0, Math.round((Date.now() - t) / 60000));
        if (m < 1) return 'hozir'; if (m < 60) return m + ' daq. oldin';
        const h = Math.round(m / 60); if (h < 24) return h + ' soat oldin';
        return Math.round(h / 24) + ' kun oldin';
    }

    G.notifications = {
        start: function (session) {
            const bell = document.querySelector('.notification-btn');
            if (!bell || bell.dataset.live) return;
            bell.dataset.live = '1';
            bell.setAttribute('role', 'button'); bell.setAttribute('tabindex', '0');
            bell.setAttribute('aria-label', 'Bildirishnomalar'); bell.setAttribute('aria-haspopup', 'true'); bell.setAttribute('aria-expanded', 'false');
            const badge = bell.querySelector('.notification-badge');
            let panel = null; let state = { items: [], unread: 0 }; let timer = 0;

            function paintBadge() {
                if (!badge) return;
                badge.hidden = !(state.unread > 0); badge.style.display = state.unread > 0 ? '' : 'none';
                badge.textContent = state.unread > 99 ? '99+' : String(state.unread);
                bell.setAttribute('aria-label', 'Bildirishnomalar' + (state.unread ? ': ' + state.unread + ' ta yangi' : ''));
            }
            async function load() {
                try { state = await get('/notifications', session); paintBadge(); if (panel) draw(); }
                catch (e) { if (e.auth) { clearInterval(timer); } /* a failed refresh keeps the old list */ }
            }
            function close() { if (panel) { panel.remove(); panel = null; bell.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); document.removeEventListener('keydown', onKey); } }
            function outside(e) { if (panel && !panel.contains(e.target) && !bell.contains(e.target)) close(); }
            function onKey(e) { if (e.key === 'Escape') { close(); bell.focus(); } }
            async function mark(path) { try { await send('PUT', path, session); } catch (e) { if (e.auth) throw e; } }

            function draw() {
                panel.textContent = '';
                const head = el('div'); head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line)';
                head.appendChild(el('b', '', 'Bildirishnomalar'));
                const acts = el('span'); acts.style.cssText = 'display:flex;gap:10px';
                const all = el('button', 'pg-btn ghost', 'Hammasi o\'qildi'); all.type = 'button'; all.style.cssText = 'padding:4px 10px;font-size:.8rem'; all.disabled = !state.unread;
                all.addEventListener('click', async function () { await mark('/notifications/read-all'); state.items.forEach(function (n) { n.read = true; }); state.unread = 0; paintBadge(); draw(); });
                const clr = el('button', 'pg-btn ghost', 'Tozalash'); clr.type = 'button'; clr.style.cssText = 'padding:4px 10px;font-size:.8rem'; clr.disabled = !state.items.length;
                clr.addEventListener('click', async function () { try { await send('DELETE', '/notifications', session); } catch (e) { if (e.auth) throw e; return; } state = { items: [], unread: 0 }; paintBadge(); draw(); });
                acts.appendChild(all); acts.appendChild(clr); head.appendChild(acts); panel.appendChild(head);
                const list = el('div'); list.style.cssText = 'max-height:min(60vh,420px);overflow-y:auto';
                if (!state.items.length) { const e = el('p', 'pg-muted', 'Hozircha yangi xabar yo\'q.'); e.style.padding = '18px 14px'; list.appendChild(e); }
                state.items.forEach(function (n) {
                    const it = el('button'); it.type = 'button';
                    it.style.cssText = 'display:block;width:100%;text-align:left;padding:10px 14px;border:0;border-bottom:1px solid var(--line);background:' + (n.read ? 'transparent' : 'var(--brand-soft)') + ';color:var(--ink);cursor:pointer;font:inherit';
                    const t = el('div', '', n.title); t.style.cssText = 'font-weight:' + (n.read ? '500' : '700') + ';overflow-wrap:anywhere';
                    it.appendChild(t);
                    if (n.body) { const b = el('div', 'pg-muted', n.body); b.style.cssText = 'font-size:.85rem;overflow-wrap:anywhere'; it.appendChild(b); }
                    const w = el('div', 'pg-muted', ago(n.created_at)); w.style.fontSize = '.75rem'; it.appendChild(w);
                    it.addEventListener('click', function () {
                        if (!n.read) { n.read = true; state.unread = Math.max(0, state.unread - 1); paintBadge(); mark('/notifications/' + n.id + '/read'); }
                        close();
                        if (n.page) { if (n.ref_id && /course/.test(n.page)) G.ctx.courseId = n.ref_id; const target = n.kind === 'battle' || n.kind === 'tournament' ? 'musobaqalar' : n.page; if (n.kind === 'tournament') G.ctx.compTab = 'season'; G.open(target, NAV[target] || target); }
                    });
                    list.appendChild(it);
                });
                panel.appendChild(list);
            }
            function open() {
                panel = el('div'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Bildirishnomalar');
                panel.style.cssText = 'position:fixed;top:70px;right:12px;width:min(380px,calc(100vw - 24px));background:var(--surface);border:1px solid var(--line-strong,var(--line));border-radius:14px;box-shadow:var(--shadow-lg);z-index:1200;overflow:hidden';
                document.body.appendChild(panel); bell.setAttribute('aria-expanded', 'true'); draw();
                document.addEventListener('click', outside, true); document.addEventListener('keydown', onKey);
                load();
            }
            function toggle() { if (panel) close(); else open(); }
            bell.addEventListener('click', toggle);
            bell.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
            load();
            timer = setInterval(function () { if (!document.hidden) load(); }, 60000);
            document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
        }
    };
})();
