/* Admin orders page: tariff orders are confirmed or rejected here; course/material requests are only listed
   (teachers answer those). Real session only. Text is always set with textContent. */
(function () {
    'use strict';
    function base() { return (window.config && window.config.apiBaseUrl) || '/api'; }
    function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
    const STATUS = { pending: ['Kutilmoqda', 'sun'], offered: ['Narx belgilandi', 'sky'], confirmed: ['Tasdiqlangan', ''], rejected: ['Rad etildi', 'coral'], cancelled: ['Bekor qilingan', 'coral'] };
    const KIND = { course: 'Kurs', material: 'Material', tariff: 'Tarif' };

    async function call(method, path, token, body) {
        const headers = { Authorization: 'Bearer ' + token };
        const init = { method: method, headers: headers };
        if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
        const res = await fetch(base() + path, init);
        const out = await res.json().catch(function () { return {}; });
        if (res.status === 401 || res.status === 403) { const e = new Error('auth'); e.auth = true; throw e; }
        if (!res.ok) throw new Error(out.error || 'HTTP ' + res.status);
        return out;
    }

    window.AdminOrders = {
        render: async function (root, token, onAuthError, toast) {
            root.textContent = '';
            const pg = el('div', 'pg'); root.appendChild(pg);
            const hd = el('div', 'pg-head'); const d = el('div');
            d.appendChild(el('h1', '', 'Buyurtmalar')); d.appendChild(el('p', '', 'Tarif buyurtmalarini tasdiqlang. Kurs va material so\'rovlariga o\'qituvchilar javob beradi'));
            hd.appendChild(d); pg.appendChild(hd);
            const chips = el('div', 'pg-chips'); pg.appendChild(chips);
            const card = el('div', 'pg-card'); card.style.padding = '8px 14px'; pg.appendChild(card);
            let kind = 'tariff'; let orders = [];

            async function load() {
                try { orders = (await call('GET', '/admin/orders?kind=' + (kind === 'tariff' ? 'tariff' : ''), token)).orders; }
                catch (e) { if (e.auth) { onAuthError(); return; } card.textContent = 'Yuklab bo\'lmadi.'; return; }
                if (kind !== 'tariff') orders = orders.filter(function (o) { return o.kind !== 'tariff'; });
                draw();
            }
            function drawChips() {
                chips.textContent = '';
                [['tariff', 'Tarif buyurtmalari'], ['other', 'Kurs va material so\'rovlari']].forEach(function (f) {
                    const b = el('button', 'pg-chip' + (kind === f[0] ? ' on' : ''), f[1]); b.type = 'button';
                    b.addEventListener('click', function () { kind = f[0]; drawChips(); load(); });
                    chips.appendChild(b);
                });
            }
            function draw() {
                card.textContent = '';
                if (!orders.length) { card.appendChild(el('p', 'pg-muted', 'Buyurtma yo\'q.')); return; }
                const wrap = el('div'); wrap.style.overflowX = 'auto';
                const t = el('table', 'pg-table'); const head = el('thead'); const hr = el('tr');
                ['Buyurtma', 'Turi', 'Holat', ''].forEach(function (h) { hr.appendChild(el('th', '', h)); });
                head.appendChild(hr); t.appendChild(head);
                const tb = el('tbody');
                orders.forEach(function (o) {
                    const tr = el('tr');
                    const c1 = el('td'); c1.appendChild(el('b', '', o.item_title)); c1.appendChild(document.createElement('br')); c1.appendChild(el('span', 'pg-muted', o.full_name));
                    if (o.note) { c1.appendChild(document.createElement('br')); c1.appendChild(el('span', 'pg-muted', o.note)); }
                    tr.appendChild(c1);
                    tr.appendChild(el('td', '', KIND[o.kind]));
                    const c3 = el('td'); const s = STATUS[o.status]; c3.appendChild(el('span', 'state pg-pill ' + s[1], s[0]));
                    if (o.price !== null && o.price !== undefined) { c3.appendChild(document.createElement('br')); c3.appendChild(el('span', 'pg-muted', o.price === 0 ? 'Tekin' : o.price + ' so\'m')); }
                    tr.appendChild(c3);
                    const c4 = el('td', 'acts');
                    if (o.kind === 'tariff' && o.status === 'pending') {
                        [['confirmed', 'Tasdiqlash', 'pg-btn'], ['rejected', 'Rad etish', 'pg-btn danger']].forEach(function (a) {
                            const b = el('button', a[2], a[1]); b.type = 'button'; b.style.cssText = 'padding:8px 14px;margin-right:6px';
                            b.addEventListener('click', async function () {
                                b.disabled = true;
                                try { await call('POST', '/admin/orders/' + o.id + '/decision', token, { status: a[0] }); toast(a[0] === 'confirmed' ? 'Buyurtma tasdiqlandi' : 'Buyurtma rad etildi'); await load(); }
                                catch (e) { if (e.auth) { onAuthError(); return; } b.disabled = false; toast(e.message); }
                            });
                            c4.appendChild(b);
                        });
                    }
                    tr.appendChild(c4); tb.appendChild(tr);
                });
                t.appendChild(tb); wrap.appendChild(t); card.appendChild(wrap);
            }
            drawChips();
            await load();
        }
    };
})();
