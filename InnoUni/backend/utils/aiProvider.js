// The AI behind the tutor. With ANTHROPIC_API_KEY set the replies come from Claude;
// without a key a clearly labelled demo reply is returned, so the whole feature can be built and tried before a key exists.
const live = () => Boolean(process.env.ANTHROPIC_API_KEY);

// The API wants messages that start with "user" and alternate: repair a history that does not
function normalise(history, message) {
    const out = [];
    for (const m of [...history, { role: 'user', content: message }]) {
        const role = m.role === 'assistant' ? 'assistant' : 'user';
        if (!out.length && role !== 'user') continue;
        if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n\n' + m.content;
        else out.push({ role, content: m.content });
    }
    return out;
}

async function claudeReply({ system, history, message }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-haiku-5-5', max_tokens: 800, system, messages: normalise(history, message) })
        });
        if (!res.ok) throw new Error(`AI service answered ${res.status}`);
        const data = await res.json();
        const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        if (!text) throw new Error('AI service returned no text');
        return text;
    } finally {
        clearTimeout(timer);
    }
}

// Demo answer: shows how the tutor talks (explain, example, check question), uses the course when there is one
function demoReply({ message, course }) {
    const topic = message.length > 80 ? message.slice(0, 77) + '...' : message;
    const lines = [`Demo javob (AI hali ulanmagan). Savolingiz: "${topic}"`, ''];
    if (/test|quiz|savol tuz/i.test(message)) {
        lines.push('Mini test namunasi:', '1) Mavzuning asosiy tushunchasi nima?', '2) Uni qayerda ishlatamiz?', '3) Bitta o\'z misolingizni keltiring.');
    } else {
        lines.push('Ustoz sifatida men shunday yo\'naltirardim:', '1) Avval mavzuning asosiy g\'oyasini o\'z so\'zlaringiz bilan yozing.', '2) Keyin bitta kichik misol ustida sinab ko\'ring.', '3) Qaysi joyi tushunarsiz qolganini ayting, birga tahlil qilamiz.');
    }
    if (course && course.lessons.length) lines.push('', `Kursdagi mos darslar: ${course.lessons.slice(0, 3).map((l) => l.title).join(', ')}.`);
    return lines.join('\n');
}

async function tutorReply(args) {
    if (live()) return { text: await claudeReply(args), provider: 'claude' };
    return { text: demoReply(args), provider: 'demo' };
}

module.exports = { tutorReply, isLive: live, normalise };
