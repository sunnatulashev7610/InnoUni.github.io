// Battle rules in one place (also sent to the page, so the form and the API never disagree)
const BATTLE_LIMITS = {
    minActiveMembers: 3,   // every team in a battle needs this many active members
    maxOpponents: 5,
    maxDays: 7,
    maxOpenPerTeam: 3,     // waiting or running battles per team
    maxPerPairPerWeek: 2,  // the same two teams cannot farm each other
    maxTitleLength: 100,
    maxTopicLength: 200,
    maxLinkLength: 300,
    maxNoteLength: 500,
    maxJudgeScore: 100
};
const BATTLE_KINDS = ['quiz', 'project'];

module.exports = { BATTLE_LIMITS, BATTLE_KINDS };
