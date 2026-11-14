// Team chat, limits, restrictions, settings, invitations and deleting a team.
process.env.JWT_SECRET = 'test-secret-test-secret-123';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');

const ADMIN = 1, ALI = 2, VALI = 3, DIL = 4, STRANGER = 5;
let fake, s, teamId;

const as = (userId) => ({ Authorization: `Bearer ${jwt.sign({ userId, email: `u${userId}@example.com`, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const api = (method, url, userId, body) => {
    const r = request(app)[method](`/api/teams${url}`).set(as(userId));
    return body === undefined ? r : r.send(body);
};
const join = async (userId, anonymous = false) => {
    await api('post', `/${teamId}/join`, userId, { anonymous });
    await api('post', `/${teamId}/members/${userId}/accept`, ADMIN);
};
const say = (userId, body) => api('post', `/${teamId}/messages`, userId, { body });
const history = (userId, query = '') => api('get', `/${teamId}/messages${query}`, userId);

beforeEach(async () => {
    fake = createTeamsFake(); s = fake.s; app.setDb(fake.db);
    const res = await api('post', '', ADMIN, { name: 'Alfa', direction: 'Til', sphere: 'IELTS', goals: '7 ball' });
    teamId = res.body.id;
    await join(ALI);
    await join(VALI);
});

describe('chat access', () => {
    test('needs a login', async () => {
        expect((await request(app).get(`/api/teams/${teamId}/messages`)).status).toBe(401);
    });

    test('only active members can read or write', async () => {
        expect((await history(STRANGER)).status).toBe(403);
        expect((await say(STRANGER, 'Salom')).status).toBe(403);
        await api('post', `/${teamId}/join`, STRANGER, {});                    // a request is not membership
        expect((await history(STRANGER)).status).toBe(403);
        await api('post', `/${teamId}/invite`, ADMIN, { email: 'dilnoza@x.uz' }); // nor is an invitation
        expect((await history(DIL)).status).toBe(403);
        expect(s.messages).toHaveLength(0);
    });

    test('unknown or invalid team', async () => {
        expect((await api('get', '/99/messages', ALI)).status).toBe(404);
        expect((await api('get', '/abc/messages', ALI)).status).toBe(400);
    });
});

describe('sending and reading', () => {
    test('a message goes to everyone in the team, marked as mine only for the sender', async () => {
        const sent = await say(ALI, '  Salom, jamoa!  ');
        expect(sent.status).toBe(201);
        expect(sent.body.message).toMatchObject({ body: 'Salom, jamoa!', mine: true, is_admin: false });
        const mine = (await history(ALI)).body.messages;
        const theirs = (await history(VALI)).body.messages;
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({ body: 'Salom, jamoa!', mine: true, name: 'Ali', user_id: ALI });
        expect(theirs[0]).toMatchObject({ mine: false, name: 'Ali', user_id: ALI });
    });

    test('the admin is marked as admin in the chat', async () => {
        await say(ADMIN, 'Xush kelibsiz');
        expect((await history(ALI)).body.messages[0]).toMatchObject({ name: 'Captain', is_admin: true });
    });

    test('empty, blank and non-text messages are rejected', async () => {
        for (const body of ['', '   ', undefined, 5, { a: 1 }, ['x']]) {
            expect([JSON.stringify(body), (await say(ALI, body)).status]).toEqual([JSON.stringify(body), 400]);
        }
        expect(s.messages).toHaveLength(0);
    });

    test('a message can have 5000 characters, not 5001', async () => {
        expect((await say(ALI, 'x'.repeat(5000))).status).toBe(201);
        const tooLong = await say(VALI, 'x'.repeat(5001));
        expect(tooLong.status).toBe(400);
        expect(tooLong.body.error).toMatch(/5000/);
        expect((await history(ALI)).body.limits.maxMessageLength).toBe(5000);
    });

    test('members who chose to hide their name are "Anonim" to members but not to the admin', async () => {
        await join(DIL, true);
        await say(DIL, 'Men yashirinman');
        const seen = (userId) => history(userId).then((r) => r.body.messages[0]);
        expect(await seen(ALI)).toMatchObject({ name: 'Anonim', user_id: null, mine: false });
        expect(await seen(DIL)).toMatchObject({ mine: true });
        expect(await seen(ADMIN)).toMatchObject({ name: 'Dilnoza', user_id: DIL });
    });

    test('pages of 50: latest first page, older ones with ?before, only new ones with ?after', async () => {
        for (let i = 1; i <= 60; i++) s.messages.push({ id: s.mid++, team_id: teamId, user_id: ALI, body: 'm' + i, created_at: Date.now() - (61 - i) * 60000, deleted_at: null }); // a minute apart: none counts as spam
        const first = (await history(VALI)).body;
        expect(first.messages).toHaveLength(50);
        expect(first.more).toBe(true);
        expect(first.messages[0].body).toBe('m11');
        expect(first.messages[49].body).toBe('m60');
        const older = (await history(VALI, `?before=${first.messages[0].id}`)).body;
        expect(older.messages.map((m) => m.body)).toEqual(Array.from({ length: 10 }, (_, i) => 'm' + (i + 1)));
        expect(older.more).toBe(false);
        await say(ALI, 'yangi');
        const fresh = (await history(VALI, `?after=${first.messages[49].id}`)).body;
        expect(fresh.messages.map((m) => m.body)).toEqual(['yangi']);
    });
});

describe('deleting messages', () => {
    test('only the admin can delete; the text is wiped and the message disappears', async () => {
        const { body } = await say(ALI, 'Nomaqul xabar');
        const id = body.message.id;
        expect((await api('delete', `/${teamId}/messages/${id}`, VALI)).status).toBe(403);
        expect((await api('delete', `/${teamId}/messages/${id}`, ALI)).status).toBe(403); // not even the author
        expect((await api('delete', `/${teamId}/messages/${id}`, ADMIN)).status).toBe(200);
        expect(s.messages[0].body).toBe('');
        expect((await history(VALI)).body.messages).toHaveLength(0);
    });

    test('open chats are told which messages were deleted', async () => {
        const a = (await say(ALI, 'bir')).body.message.id;
        const b = (await say(ALI, 'ikki')).body.message.id;
        await api('delete', `/${teamId}/messages/${a}`, ADMIN);
        const poll = (await history(VALI, `?after=${b}&from=${a}`)).body;
        expect(poll.deleted).toEqual([a]);
        expect(poll.messages).toEqual([]);
        expect((await history(VALI, `?after=${b}`)).body.deleted).toEqual([]); // not asked for
    });

    test('unknown, bad and already deleted ids', async () => {
        const id = (await say(ALI, 'x')).body.message.id;
        expect((await api('delete', `/${teamId}/messages/999`, ADMIN)).status).toBe(404);
        expect((await api('delete', `/${teamId}/messages/abc`, ADMIN)).status).toBe(400);
        await api('delete', `/${teamId}/messages/${id}`, ADMIN);
        expect((await api('delete', `/${teamId}/messages/${id}`, ADMIN)).status).toBe(404);
    });

    test('a message of another team cannot be deleted through this one', async () => {
        const other = (await api('post', '', ALI, { name: 'Beta', direction: 'Fan', sphere: 'Algebra', goals: 'x' })).body.id;
        s.messages.push({ id: s.mid++, team_id: other, user_id: ALI, body: 'sir', created_at: Date.now(), deleted_at: null });
        expect((await api('delete', `/${teamId}/messages/${s.messages[0].id}`, ADMIN)).status).toBe(404);
        expect(s.messages[0].body).toBe('sir');
    });
});

describe('spam and restrictions', () => {
    test('too many messages in a short time restrict the sender automatically', async () => {
        for (let i = 0; i < 8; i++) expect((await say(ALI, 'spam ' + i)).status).toBe(201);
        const ninth = await say(ALI, 'spam 9');
        expect(ninth.status).toBe(429);
        expect(ninth.body.muted_seconds).toBe(300);
        const next = await say(ALI, 'yana');
        expect(next.status).toBe(403);
        expect(next.body.muted_seconds).toBeGreaterThan(0);
        expect((await say(VALI, 'men yozaman')).status).toBe(201);   // others are not affected
        expect(s.messages.filter((m) => m.user_id === ALI)).toHaveLength(8);
    });

    test('the admin is not limited by the spam guard', async () => {
        for (let i = 0; i < 12; i++) expect((await say(ADMIN, 'e\'lon ' + i)).status).toBe(201);
    });

    test('the admin restricts a member for 10 minutes, 1 hour or 1 day, and the member sees it', async () => {
        for (const minutes of [10, 60, 1440]) {
            const r = await api('post', `/${teamId}/members/${ALI}/mute`, ADMIN, { minutes });
            expect([minutes, r.status]).toEqual([minutes, 200]);
        }
        const blocked = await say(ALI, 'salom');
        expect(blocked.status).toBe(403);
        expect(blocked.body.muted_seconds).toBeGreaterThan(86000);
        const me = (await history(ALI)).body.me;
        expect(me.muted).toBe(true);
        expect(me.muted_seconds).toBeGreaterThan(86000);
        expect(s.messages).toHaveLength(0);
        expect((await history(ALI)).status).toBe(200);              // reading is still allowed
    });

    test('only listed durations; not the admin; not a stranger; only the admin can do it', async () => {
        for (const minutes of [0, 5, 61, -10, 'x', undefined]) {
            expect([String(minutes), (await api('post', `/${teamId}/members/${ALI}/mute`, ADMIN, { minutes })).status]).toEqual([String(minutes), 400]);
        }
        expect((await api('post', `/${teamId}/members/${ADMIN}/mute`, ADMIN, { minutes: 10 })).status).toBe(400);
        expect((await api('post', `/${teamId}/members/${STRANGER}/mute`, ADMIN, { minutes: 10 })).status).toBe(404);
        expect((await api('post', `/${teamId}/members/${VALI}/mute`, ALI, { minutes: 10 })).status).toBe(403);
        expect((await api('delete', `/${teamId}/members/${VALI}/mute`, ALI)).status).toBe(403);
    });

    test('the admin can lift the restriction, and it ends by itself', async () => {
        await api('post', `/${teamId}/members/${ALI}/mute`, ADMIN, { minutes: 60 });
        expect((await say(ALI, 'a')).status).toBe(403);
        expect((await api('delete', `/${teamId}/members/${ALI}/mute`, ADMIN)).status).toBe(200);
        expect((await say(ALI, 'a')).status).toBe(201);
        await api('post', `/${teamId}/members/${VALI}/mute`, ADMIN, { minutes: 10 });
        s.members.find((m) => m.user_id === VALI).muted_until = Date.now() - 1000;   // time passed
        expect((await say(VALI, 'b')).status).toBe(201);
    });

    test('restrictions are visible to the admin only', async () => {
        await api('post', `/${teamId}/members/${ALI}/mute`, ADMIN, { minutes: 10 });
        const asAdmin = (await api('get', `/${teamId}/members`, ADMIN)).body.members.find((m) => m.name === 'Ali');
        const asVali = (await api('get', `/${teamId}/members`, VALI)).body.members.find((m) => m.name === 'Ali');
        expect(asAdmin.muted_seconds).toBeGreaterThan(0);
        expect(asVali.muted_seconds).toBe(0);
    });
});

describe('members limit', () => {
    const fill = () => { for (let u = 100; u < 100 + 97; u++) fake.addMember(teamId, u, 'active'); };   // admin + Ali + Vali + 97 = 100

    test('a team holds 100 members', async () => {
        fill();
        expect(s.members.filter((m) => m.status === 'active')).toHaveLength(100);
        const full = await api('post', `/${teamId}/join`, STRANGER, {});
        expect(full.status).toBe(400);
        expect(full.body.error).toMatch(/full/);
    });

    test('and a request, an invitation and an acceptance beyond 100 are refused', async () => {
        await api('post', `/${teamId}/join`, STRANGER, {});
        await api('post', `/${teamId}/invite`, ADMIN, { email: 'dilnoza@x.uz' });
        fill();
        expect((await api('post', `/${teamId}/members/${STRANGER}/accept`, ADMIN)).status).toBe(400);
        expect((await api('post', `/${teamId}/invitation/accept`, DIL)).status).toBe(400);
        expect((await api('post', `/${teamId}/invite`, ADMIN, { email: 'ali@x.uz' })).status).not.toBe(201);
        s.members = s.members.filter((m) => m.user_id !== 100);   // one place frees up
        expect((await api('post', `/${teamId}/invitation/accept`, DIL)).status).toBe(200);
    });
});

describe('team settings', () => {
    test('the admin changes the details and who can invite; only sent fields change', async () => {
        const res = await api('put', `/${teamId}`, ADMIN, { name: 'Yangi nom', direction: 'Fan', sphere: 'Algebra', goals: 'Olimpiada', description: 'Tavsif', invite_mode: 'members' });
        expect(res.status).toBe(200);
        expect(res.body.team).toMatchObject({ name: 'Yangi nom', direction: 'Fan', sphere: 'Algebra', goals: 'Olimpiada', description: 'Tavsif', invite_mode: 'members', is_captain: true });
        await api('put', `/${teamId}`, ADMIN, { goals: 'Boshqa maqsad' });
        expect(s.teams[0]).toMatchObject({ name: 'Yangi nom', goals: 'Boshqa maqsad', invite_mode: 'members' });
    });

    test('checked like when opening a team', async () => {
        for (const bad of [{ name: ' ' }, { direction: 'Ixtiyoriy' }, { sphere: '' }, { goals: 'x'.repeat(501) }, { description: 'x'.repeat(1001) }, { invite_mode: 'hamma' }, {}]) {
            expect([JSON.stringify(bad), (await api('put', `/${teamId}`, ADMIN, bad)).status]).toEqual([JSON.stringify(bad), 400]);
        }
        expect(s.teams[0].name).toBe('Alfa');
    });

    test('only the admin; unknown team; a taken name', async () => {
        expect((await api('put', `/${teamId}`, ALI, { name: 'Hack' })).status).toBe(403);
        expect((await api('put', '/99', ADMIN, { name: 'X1' })).status).toBe(404);
        await api('post', '', ALI, { name: 'Beta', direction: 'Fan', sphere: 'x', goals: 'y' });
        const dup = await api('put', `/${teamId}`, ADMIN, { name: 'Beta' });
        expect(dup.status).toBe(409);
        expect(s.teams[0].name).toBe('Alfa');
    });
});

describe('deleting a team', () => {
    test('only the owner; members and the chat go with it', async () => {
        await say(ALI, 'salom');
        expect((await api('delete', `/${teamId}`, ALI)).status).toBe(403);
        expect(s.teams).toHaveLength(1);
        expect((await api('delete', `/${teamId}`, ADMIN)).status).toBe(200);
        expect(s.teams).toHaveLength(0);
        expect(s.members).toHaveLength(0);
        expect(s.messages).toHaveLength(0);
        expect((await api('delete', `/${teamId}`, ADMIN)).status).toBe(404);
        expect((await api('delete', '/abc', ADMIN)).status).toBe(400);
    });

    test('the owner can open a new team after deleting one (the limit counts existing teams)', async () => {
        for (let i = 2; i <= 5; i++) await api('post', '', ADMIN, { name: 'T' + i, direction: 'Fan', sphere: 'x', goals: 'y' });
        expect((await api('post', '', ADMIN, { name: 'T6', direction: 'Fan', sphere: 'x', goals: 'y' })).status).toBe(400);
        await api('delete', `/${teamId}`, ADMIN);
        expect((await api('post', '', ADMIN, { name: 'T6', direction: 'Fan', sphere: 'x', goals: 'y' })).status).toBe(201);
    });
});

describe('inviting members', () => {
    test('the admin invites a registered person by email; they accept and join', async () => {
        const inv = await api('post', `/${teamId}/invite`, ADMIN, { email: ' Dilnoza@X.uz ' });
        expect(inv.status).toBe(201);
        expect(inv.body.name).toBe('Dilnoza');
        const team = (await api('get', `/${teamId}`, DIL)).body.team;
        expect(team).toMatchObject({ my_status: 'pending', invited: true, members: 3 });
        expect((await history(DIL)).status).toBe(403);
        expect((await api('post', `/${teamId}/invitation/accept`, DIL)).status).toBe(200);
        expect((await api('get', `/${teamId}`, DIL)).body.team).toMatchObject({ my_status: 'active', invited: false, members: 4 });
        expect((await say(DIL, 'Rahmat')).status).toBe(201);
    });

    test('an invitation can be declined, and the admin sees invitations apart from requests', async () => {
        await api('post', `/${teamId}/invite`, ADMIN, { email: 'dilnoza@x.uz' });
        await api('post', `/${teamId}/join`, STRANGER, {});
        const list = (await api('get', `/${teamId}/members`, ADMIN)).body;
        expect(list.members.filter((m) => m.status === 'pending').map((m) => [m.user_id, m.invited])).toEqual([[DIL, true], [STRANGER, false]]);
        expect((await api('get', '', ADMIN)).body.teams[0].pending_requests).toBe(1);   // only the request counts
        expect((await api('post', `/${teamId}/invitation/decline`, DIL)).status).toBe(200);
        expect(s.members.find((m) => m.user_id === DIL)).toBeUndefined();
        expect((await api('post', `/${teamId}/invitation/decline`, DIL)).status).toBe(404);
    });

    test('an invitation cannot be accepted by the admin on the person\'s behalf, and a request cannot be accepted as an invitation', async () => {
        await api('post', `/${teamId}/invite`, ADMIN, { email: 'dilnoza@x.uz' });
        expect((await api('post', `/${teamId}/members/${DIL}/accept`, ADMIN)).status).toBe(404);
        await api('post', `/${teamId}/join`, STRANGER, {});
        expect((await api('post', `/${teamId}/invitation/accept`, STRANGER)).status).toBe(404);
        expect(s.members.find((m) => m.user_id === DIL).status).toBe('pending');
        expect(s.members.find((m) => m.user_id === STRANGER).status).toBe('pending');
    });

    test('the admin can cancel an invitation', async () => {
        await api('post', `/${teamId}/invite`, ADMIN, { email: 'dilnoza@x.uz' });
        expect((await api('delete', `/${teamId}/members/${DIL}`, ADMIN)).status).toBe(200);
        expect(s.members.find((m) => m.user_id === DIL)).toBeUndefined();
    });

    test('bad email, unknown or blocked person, already in the team', async () => {
        expect((await api('post', `/${teamId}/invite`, ADMIN, { email: 'bad' })).status).toBe(400);
        expect((await api('post', `/${teamId}/invite`, ADMIN, {})).status).toBe(400);
        expect((await api('post', `/${teamId}/invite`, ADMIN, { email: 'yoq@x.uz' })).status).toBe(404);
        s.blocked[DIL] = true;
        expect((await api('post', `/${teamId}/invite`, ADMIN, { email: 'dilnoza@x.uz' })).status).toBe(404);
        s.blocked[DIL] = false;
        expect((await api('post', `/${teamId}/invite`, ADMIN, { email: 'ali@x.uz' })).status).toBe(409);
        await api('post', `/${teamId}/invite`, ADMIN, { email: 'dilnoza@x.uz' });
        expect((await api('post', `/${teamId}/invite`, ADMIN, { email: 'dilnoza@x.uz' })).status).toBe(409);
    });

    test('who may invite depends on the team setting', async () => {
        const byMember = () => api('post', `/${teamId}/invite`, ALI, { email: 'dilnoza@x.uz' });
        expect((await byMember()).status).toBe(403);                                           // default: only the admin
        await api('put', `/${teamId}`, ADMIN, { invite_mode: 'members' });
        expect((await api('post', `/${teamId}/invite`, STRANGER, { email: 'dilnoza@x.uz' })).status).toBe(403); // outsiders never
        const ok = await byMember();
        expect(ok.status).toBe(201);
        expect(s.members.find((m) => m.user_id === DIL).invited_by).toBe(ALI);
        await api('put', `/${teamId}`, ADMIN, { invite_mode: 'admin' });
        await api('delete', `/${teamId}/members/${DIL}`, ADMIN);
        expect((await byMember()).status).toBe(403);
    });
});

describe('leaving', () => {
    test('a member leaves and loses the chat; the admin cannot leave; strangers cannot', async () => {
        expect((await api('post', `/${teamId}/leave`, ALI)).status).toBe(200);
        expect((await history(ALI)).status).toBe(403);
        expect((await api('post', `/${teamId}/leave`, ALI)).status).toBe(404);
        expect((await api('post', `/${teamId}/leave`, ADMIN)).status).toBe(400);
        expect(s.members.some((m) => m.user_id === ADMIN)).toBe(true);
    });

    test('a person can withdraw their own request', async () => {
        await api('post', `/${teamId}/join`, STRANGER, {});
        expect((await api('post', `/${teamId}/leave`, STRANGER)).status).toBe(200);
        expect(s.members.find((m) => m.user_id === STRANGER)).toBeUndefined();
    });
});

describe('members list', () => {
    test('says who the admin is and what the viewer is', async () => {
        const res = (await api('get', `/${teamId}/members`, ALI)).body;
        expect(res.members.find((m) => m.is_admin).name).toBe('Captain');
        expect(res.me).toMatchObject({ status: 'active', invited: false, muted: false });
        expect(res.limits).toMatchObject({ maxMembers: 100, maxMessageLength: 5000, maxTeamsPerUser: 5 });
        expect((await api('get', `/${teamId}/members`, STRANGER)).body.me).toBeNull();
    });
});
