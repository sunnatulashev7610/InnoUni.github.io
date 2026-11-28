// Question sets for the live team games. kind: quiz (4 options), tf (true / false statements), pairs (term + definition).
const crypto = require('crypto');
const { cleanQuestions, LIMITS } = require('./tournamentQuestions');

const KINDS = ['quiz', 'tf', 'pairs'];
const TF_OPTIONS = ["To'g'ri", "Noto'g'ri"];                      // answer 0 = true, 1 = false
const PAIR_LIMITS = { min: 4, max: 20, maxText: 200 };
const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Returns {questions} or {error}; questions are stored as {q, options, answer, explanation}
function cleanTrueFalse(list) {
    if (!Array.isArray(list) || list.length < LIMITS.min || list.length > LIMITS.max) return { error: `A set needs ${LIMITS.min} to ${LIMITS.max} questions` };
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const x = list[i] || {}; const n = i + 1; const q = str(x.q); const explanation = str(x.explanation);
        if (!q) return { error: `Question ${n}: the question text is empty` };
        if (q.length > LIMITS.maxQuestion) return { error: `Question ${n}: the question is too long` };
        if (x.answer !== 0 && x.answer !== 1) return { error: `Question ${n}: choose the correct option` };
        if (explanation.length > LIMITS.maxExplanation) return { error: `Question ${n}: the explanation is too long` };
        out.push({ q, options: TF_OPTIONS.slice(), answer: x.answer, explanation });
    }
    return { questions: out };
}

// Pairs are stored as {term, definition}. The options of each question are made when the game is played (see expandPairs)
function cleanPairs(list) {
    if (!Array.isArray(list) || list.length < PAIR_LIMITS.min || list.length > PAIR_LIMITS.max) return { error: `A set needs ${PAIR_LIMITS.min} to ${PAIR_LIMITS.max} questions` };
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const x = list[i] || {}; const n = i + 1; const term = str(x.term); const definition = str(x.definition);
        if (!term || !definition) return { error: `Question ${n}: the pair is not filled` };
        if (term.length > PAIR_LIMITS.maxText || definition.length > PAIR_LIMITS.maxText) return { error: `Question ${n}: the text is too long` };
        out.push({ term, definition });
    }
    if (new Set(out.map((p) => p.term.toLowerCase())).size !== out.length || new Set(out.map((p) => p.definition.toLowerCase())).size !== out.length) return { error: 'The terms and the definitions must be different' };
    return { questions: out };
}

function cleanSet(kind, list) {
    if (kind === 'tf') return cleanTrueFalse(list);
    if (kind === 'pairs') return cleanPairs(list);
    const r = cleanQuestions(list);
    if (r.error) return r;
    if (!r.questions.length) return { error: `A set needs ${LIMITS.min} to ${LIMITS.max} questions` };
    return r;
}

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
// Turns pairs into quiz questions. The three wrong definitions and the order are fixed by the session id,
// so every poll sees the same options, and the browser still cannot tell which one is right.
function expandPairs(pairs, sessionId) {
    return pairs.map((p, i) => {
        const others = pairs.map((_, j) => j).filter((j) => j !== i).sort((a, b) => hash(`${sessionId}:${i}:d:${a}`).localeCompare(hash(`${sessionId}:${i}:d:${b}`))).slice(0, 3);
        const ids = [i, ...others].sort((a, b) => hash(`${sessionId}:${i}:o:${a}`).localeCompare(hash(`${sessionId}:${i}:o:${b}`)));
        return { q: `«${p.term}» qaysi ta'rifga mos?`, options: ids.map((j) => pairs[j].definition), answer: ids.indexOf(i), explanation: `${p.term} — ${p.definition}` };
    });
}

module.exports = { KINDS, PAIR_LIMITS, TF_OPTIONS, cleanSet, expandPairs };
