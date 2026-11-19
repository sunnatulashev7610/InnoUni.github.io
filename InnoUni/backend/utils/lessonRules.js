// The rules of an AI lesson: a plan, a talk with the AI along the plan, then a quiz. The next lesson opens only after the quiz is passed.
module.exports = {
    QUIZ_QUESTIONS: 10,   // questions in one quiz
    QUIZ_OPTIONS: 4,      // answers per question, exactly one is right
    PASS_SCORE: 8,        // right answers needed to finish the lesson
    MIN_CHAT_MESSAGES: 3  // the student must have talked through the lesson a little before the quiz opens
};
