// Team limits. "Initially" values: change them here when a team plan needs more.
const LIMITS = {
    maxTeamsPerUser: 5,     // teams one person can open
    maxMembers: 100,        // active members in one team
    maxMessageLength: 5000  // characters in one chat message
};

// How long the admin can restrict a member from writing (minutes)
const MUTE_MINUTES = [10, 60, 1440];

// Spam guard: this many messages inside the window mutes the sender automatically
const FLOOD = { messages: 8, windowSeconds: 20, muteMinutes: 5 };

// Who may invite new members (a team setting)
const INVITE_MODES = ['admin', 'members'];

module.exports = { LIMITS, MUTE_MINUTES, FLOOD, INVITE_MODES };
