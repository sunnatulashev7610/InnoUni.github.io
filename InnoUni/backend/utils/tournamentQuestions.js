// Questions the admin writes for a tournament stage. Same shape the AI makes: {q, options[4], answer, explanation}.
const LIMITS = { min: 3, max: 20, options: 4, maxQuestion: 400, maxOption: 200, maxExplanation: 300 };
const SLOTS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'quarter', 'semi', 'final'];
const slotOfRound = (round) => `r${round}`;

// Returns {questions} or {error}. An empty list means "no own questions: use the AI".
function cleanQuestions(list) {
    if (!Array.isArray(list)) return { error: 'Questions must be a list' };
    if (list.length === 0) return { questions: [] };
    if (list.length < LIMITS.min || list.length > LIMITS.max) return { error: `A stage needs ${LIMITS.min} to ${LIMITS.max} questions` };
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const x = list[i] || {}; const n = i + 1;
        const q = str(x.q); const explanation = str(x.explanation);
        if (!q) return { error: `Question ${n}: the question text is empty` };
        if (q.length > LIMITS.maxQuestion) return { error: `Question ${n}: the question is too long` };
        const options = (Array.isArray(x.options) ? x.options : []).map(str);
        if (options.length !== LIMITS.options || options.some((o) => !o)) return { error: `Question ${n}: it needs exactly ${LIMITS.options} filled options` };
        if (options.some((o) => o.length > LIMITS.maxOption)) return { error: `Question ${n}: an option is too long` };
        if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { error: `Question ${n}: the options must be different` };
        if (!Number.isInteger(x.answer) || x.answer < 0 || x.answer >= LIMITS.options) return { error: `Question ${n}: choose the correct option` };
        if (explanation.length > LIMITS.maxExplanation) return { error: `Question ${n}: the explanation is too long` };
        out.push({ q, options, answer: x.answer, explanation });
    }
    return { questions: out };
}

module.exports = { LIMITS, SLOTS, slotOfRound, cleanQuestions };
