// Renders the real dashboard scripts in jsdom with hostile data and checks that nothing executes.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const JS_DIR = path.join(__dirname, '../../frontend/js');
const read = (name) => fs.readFileSync(path.join(JS_DIR, name), 'utf8');

const PAYLOAD_IMG = '<img src=x onerror="window.__xss=1">';
const PAYLOAD_SCRIPTISH = '"><svg onload="window.__xss=1">';
const BAD_URL = 'javascript:window.__xss=1';

const openWindows = [];
afterAll(() => openWindows.forEach((w) => w.close()));

function makeWindow(bodyHtml) {
    const dom = new JSDOM(`<!doctype html><body>${bodyHtml}</body>`, {
        runScripts: 'outside-only',
        url: 'http://localhost/dashboard/1'
    });
    const { window } = dom;
    openWindows.push(window);
    window.__xss = 0;
    // The dashboards start themselves on DOMContentLoaded: stub the API so that happens harmlessly
    window.api = {
        verifyToken: () => new Promise(() => {}), // never resolves: the auto-started dashboard just waits
        request: async () => ({})
    };
    window.eval(read('utils.js'));
    return window;
}

// Lets any pending image load / error events fire (jsdom does not load images, but be safe)
const tick = () => new Promise((r) => setTimeout(r, 20));

describe('utils.js', () => {
    const window = makeWindow('');

    test('escapeHtml neutralises markup and quotes', () => {
        expect(window.escapeHtml(PAYLOAD_IMG)).not.toContain('<');
        expect(window.escapeHtml(PAYLOAD_SCRIPTISH)).not.toContain('"');
        expect(window.escapeHtml(null)).toBe('');
        expect(window.escapeHtml(5)).toBe('5');
    });

    test('safeUrl blocks script URLs but keeps normal ones', () => {
        const fb = 'https://fallback/x.png';
        expect(window.safeUrl(BAD_URL, fb)).toBe(fb);
        expect(window.safeUrl('  JaVaScRipt:alert(1)', fb)).toBe(fb);
        expect(window.safeUrl('data:text/html;base64,PHNjcmlwdD4=', fb)).toBe(fb);
        expect(window.safeUrl('vbscript:x', fb)).toBe(fb);
        expect(window.safeUrl('https://example.com/a.png', fb)).toBe('https://example.com/a.png');
        expect(window.safeUrl('/uploads/a.png', fb)).toBe('/uploads/a.png');
        expect(window.safeUrl('data:image/png;base64,AAAA', fb)).toBe('data:image/png;base64,AAAA');
        expect(window.safeUrl('', fb)).toBe(fb);
        expect(window.safeUrl(null, fb)).toBe(fb);
    });
});

describe('student dashboard rendering', () => {
    let window;
    let dashboard;

    beforeAll(() => {
        window = makeWindow(`
            <div class="user-info"></div><div class="stats-grid"></div>
            <div class="courses-container"></div><div class="groups-container"></div>
            <div class="tasks-container"></div><div class="achievements-container"></div>
            <div class="recommendations-container"></div>`);
        window.eval(read('studentDashboard.js') + '\n;window.StudentDashboard = StudentDashboard;');
        const StudentDashboard = window.StudentDashboard;
        StudentDashboard.prototype.init = async function () {}; // no network
        dashboard = new StudentDashboard();

        dashboard.currentUser = { id: 1, full_name: PAYLOAD_IMG, avatar: BAD_URL };
        dashboard.dashboardData = {
            stats: { enrolled_courses: 1, avg_progress: 10, overdue_tasks: 0, active_groups: 1, current_streak: 2 },
            courses: [{ id: 1, title: PAYLOAD_IMG, category: PAYLOAD_SCRIPTISH, teacher_name: PAYLOAD_IMG,
                        avatar: BAD_URL, progress: 10, pending_tasks: 0, overdue_tasks: 0 }],
            groups: [{ id: 1, name: PAYLOAD_IMG, description: PAYLOAD_IMG, logo: BAD_URL,
                       student_role: 'member', total_members: 2, active_projects: 0 }],
            tasks: [{ id: 1, title: PAYLOAD_IMG, description: PAYLOAD_IMG, course_title: PAYLOAD_IMG,
                      priority: PAYLOAD_SCRIPTISH, status: 'pending', due_date: '2030-01-01' }],
            achievements: [{ title: PAYLOAD_IMG, description: PAYLOAD_IMG, icon: PAYLOAD_SCRIPTISH, earned_at: '2030-01-01' }]
        };
        dashboard.recommendations = {
            recommended_courses: [{ id: 2, title: PAYLOAD_IMG, category: PAYLOAD_IMG, teacher_name: PAYLOAD_IMG }],
            available_groups: [{ id: 3, name: PAYLOAD_IMG, current_members: 1 }]
        };
        dashboard.renderStudentDashboard();
    });

    test('script from the source file still parses and renders', () => {
        expect(window.document.querySelector('.course-card')).not.toBeNull();
        expect(window.document.querySelector('.group-role').textContent).toBe('A\'zo');
    });

    test('no injected element or handler exists in the rendered DOM', async () => {
        await tick();
        expect(window.document.querySelectorAll('img[onerror], svg[onload], [onerror], [onload]').length).toBe(0);
        expect(window.__xss).toBe(0);
    });

    test('hostile text is shown as plain text', () => {
        expect(window.document.querySelector('.course-card h4').textContent).toBe(PAYLOAD_IMG);
        expect(window.document.querySelector('.group-card h4').textContent).toBe(PAYLOAD_IMG);
    });

    test('javascript: avatar URLs are replaced by the fallback', () => {
        const srcs = [...window.document.querySelectorAll('img')].map((i) => i.getAttribute('src'));
        expect(srcs.length).toBeGreaterThan(0);
        srcs.forEach((s) => expect(s.toLowerCase().startsWith('javascript:')).toBe(false));
    });

    test('showNotification does not render HTML from the message', () => {
        window.document.body.insertAdjacentHTML('beforeend', '<div id="host"></div>');
        dashboard.showNotification(PAYLOAD_IMG, 'error');
        expect(window.document.querySelectorAll('.notification img').length).toBe(0);
        expect(window.document.querySelector('.notification').textContent).toContain('<img');
    });
});

describe('teacher dashboard rendering', () => {
    test('hostile course, student and activity data does not execute', async () => {
        const window = makeWindow(`
            <div class="user-info"></div><div class="stats-grid"></div>
            <div class="courses-container"></div><div class="activity-container"></div>
            <div class="quick-actions-container"></div>`);
        window.eval(read('teacherDashboard.js') + '\n;window.TeacherDashboard = TeacherDashboard;');
        const TeacherDashboard = window.TeacherDashboard;
        TeacherDashboard.prototype.init = async function () {};
        const d = new TeacherDashboard();

        d.currentUser = { id: 1, full_name: PAYLOAD_IMG, avatar: BAD_URL };
        d.dashboardData = {
            stats: { total_courses: 1, total_students: 1, total_completions: 1, avg_course_progress: 5,
                     total_tasks_completed: 1, total_tasks_assigned: 2 },
            courses: [{ id: 1, title: PAYLOAD_IMG, category: PAYLOAD_SCRIPTISH, status: 'active', avatar: BAD_URL,
                        enrolled_students: 1, completed_students: 0, avg_progress: 1, new_enrollments_this_week: 0 }],
            recentActivities: [{ student_name: PAYLOAD_IMG, activity_type: PAYLOAD_SCRIPTISH, course_title: PAYLOAD_IMG,
                                 timestamp: '2030-01-01', student_progress: 5 }]
        };
        d.renderTeacherDashboard();
        await tick();

        expect(window.document.querySelector('.course-card')).not.toBeNull();
        expect(window.document.querySelectorAll('[onerror], [onload]').length).toBe(0);
        expect(window.__xss).toBe(0);
    });
});

describe('every dashboard script parses', () => {
    test.each(['authHandler.js', 'dashboard.js', 'studentDashboard.js', 'teacherDashboard.js', 'utils.js'])(
        '%s', (file) => {
            expect(() => new Function(read(file))).not.toThrow();
        }
    );
});
