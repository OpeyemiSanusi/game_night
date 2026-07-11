export const GAME_PHASES = [
  "LOBBY",
  "TEAM_SETUP",
  "ROUND_INTRO",
  "CHALLENGE_SELECTION",
  "QUESTION_ACTIVE",
  "VOTING_LOCKED",
  "ANSWER_REVEAL",
  "ROUND_DRAW",
  "SAVING_GRACE_CATEGORY",
  "SAVING_GRACE_ACTIVE",
  "SAVING_GRACE_RESULT",
  "SACRIFICIAL_LAMB_SELECTION",
  "SACRIFICIAL_LAMB_REVEAL",
  "CONSEQUENCE_CHOICE",
  "DRINK_CONFIRMATION",
  "CHALLENGE_REVEAL",
  "CHALLENGE_ACTIVE",
  "CHALLENGE_RESULT",
  "RESCUER_SELECTION",
  "RESCUER_REVEAL",
  "BOTTLE_FLIP_ACTIVE",
  "BOTTLE_FLIP_RESULT",
  "PIE_CONFIRMATION",
  "ROUND_COMPLETE",
  "FINAL_RESULTS",
] as const;

export type GamePhase = (typeof GAME_PHASES)[number];

export type PlayerStatus = "active" | "pending" | "inactive";

export type SavingGraceCategory =
  | "TIME_OF_DAY"
  | "NEXT_SENDER"
  | "REACTION_COUNT";

export type ConsequenceChoice = "DRINK" | "CHALLENGE";

export type HostAction =
  | "LOCK_TEAMS"
  | "START_GAME"
  | "SHOW_QUESTION"
  | "LOCK_VOTING"
  | "REVEAL_ANSWER"
  | "START_SAVING_GRACE"
  | "START_SAVING_GRACE_ACTIVE"
  | "REVEAL_SAVING_GRACE"
  | "START_LAMB_SELECTION"
  | "REVEAL_SACRIFICIAL_LAMB"
  | "START_CONSEQUENCE_CHOICE"
  | "START_PENALTY_QUEUE"
  | "CONFIRM_DRINK"
  | "START_CHALLENGE"
  | "CHALLENGE_PASSED"
  | "CHALLENGE_FAILED"
  | "START_BOTTLE_FLIP"
  | "BOTTLE_LANDED"
  | "BOTTLE_MISSED"
  | "CONFIRM_PIE"
  | "NEXT_ROUND"
  | "END_GAME"
  | "PAUSE"
  | "RESUME"
  | "ADD_5"
  | "ADD_10"
  | "END_TIMER";

export interface AnswerOption {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface PublicQuestion {
  roundId: string;
  roundNumber: number;
  quote: string;
  answerOptions: AnswerOption[];
}

export interface RevealedAnswer {
  correctAnswerId: string;
  correctAnswerName: string;
}

export interface TeamScoreResult {
  teamId: string;
  teamIndex: number;
  name: string;
  color: string;
  correctVotes: number;
  eligiblePlayers: number;
  accuracy: number;
  outcome: "winner" | "safe" | "last" | "draw";
}

export interface RoundResultsPublic {
  revealedAnswer?: RevealedAnswer;
  teams: TeamScoreResult[];
  winnerTeamIds: string[];
  lastPlaceTeamIds: string[];
  safeTeamIds: string[];
  completeDraw: boolean;
}

export interface RoundLeaderPublic {
  teamId: string;
  teamIndex: number;
  teamName: string;
  teamColor: string;
  playerId: string;
  displayName: string;
  initials: string;
  avatarUrl: string | null;
}

export interface VoteProgressPublic {
  submitted: number;
  eligible: number;
}

export interface SavingGracePublic {
  teamIds: string[];
  categoryByTeamId: Record<string, SavingGraceCategory | null>;
  answeredTeamIds: string[];
  resultsByTeamId?: Record<
    string,
    {
      category: SavingGraceCategory;
      answer: string | null;
      correctAnswer: string;
      isCorrect: boolean;
    }
  >;
}

export interface PenaltyPublic {
  id: string;
  teamId: string;
  teamIndex: number;
  teamName: string;
  teamColor: string;
  lambPlayerId: string | null;
  lambName: string | null;
  rescuerPlayerId: string | null;
  rescuerName: string | null;
  consequenceChoice: ConsequenceChoice | null;
  status: string;
  queueIndex: number;
  isActive: boolean;
  challenge?: {
    title: string;
    instructions: string;
    durationSeconds: number;
    successCriteria: string;
  };
}

export interface PlayerPublic {
  id: string;
  teamId: string | null;
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  joinOrder: number;
  status: PlayerStatus;
  isConnected: boolean;
}

export interface TeamPublic {
  id: string;
  teamIndex: number;
  name: string;
  color: string;
  icon: string;
  score: number;
  playerCount: number;
  players: PlayerPublic[];
}

export interface PublicTimerState {
  phaseStartedAt: string | null;
  phaseEndsAt: string | null;
  isPaused: boolean;
  remainingMsWhenPaused: number | null;
}

export interface PublicRoomState {
  roomId: string;
  roomCode: string;
  title: string;
  phase: GamePhase;
  teamCount: number;
  currentRoundNumber: number;
  version: number;
  updatedAt: string;
  createdAt: string;
  timer: PublicTimerState;
  lobby: {
    joinUrl: string;
    playerCount: number;
    activePlayerCount: number;
    pendingPlayerCount: number;
    softCap: number;
  };
  teams: TeamPublic[];
  players: PlayerPublic[];
  leaderboard: Array<{
    teamId: string;
    teamIndex: number;
    name: string;
    color: string;
    score: number;
  }>;
  leaders?: RoundLeaderPublic[];
  question?: PublicQuestion;
  voteProgress?: VoteProgressPublic;
  roundResults?: RoundResultsPublic;
  savingGrace?: SavingGracePublic;
  penalties?: PenaltyPublic[];
  activePenalty?: PenaltyPublic | null;
  finalWinnerTeamIds?: string[];
}

export interface PlayerPrivateState {
  room: {
    id: string;
    roomCode: string;
    title: string;
    phase: GamePhase;
    teamCount: number;
  };
  player: PlayerPublic;
  team: TeamPublic | null;
  role: "player" | "leader" | "lamb" | "rescuer";
  message: string;
  myVote?: string | null;
  actions?: {
    canVote?: boolean;
    answerOptions?: AnswerOption[];
    leaderChallengeOptions?: Array<{
      assignmentId: string;
      challengeId: string;
      title: string;
      instructions: string;
      durationSeconds: number;
      successCriteria: string;
    }>;
    savingGraceCategories?: SavingGraceCategory[];
    savingGraceQuestion?: {
      category: SavingGraceCategory;
      prompt: string;
      options: string[];
    };
    lambOptions?: PlayerPublic[];
    consequenceOptions?: ConsequenceChoice[];
    rescuerOptions?: PlayerPublic[];
  };
}

export interface HostPrivateState {
  room: {
    id: string;
    roomCode: string;
    title: string;
    phase: GamePhase;
    teamCount: number;
    currentRoundNumber: number;
    settings: Record<string, unknown>;
  };
  publicState: PublicRoomState;
  nextRecommendedAction: string;
  game?: {
    packs: Array<{ id: string; name: string; enabled: boolean }>;
    challengeDecks: Array<{ id: string; name: string; enabled: boolean }>;
    currentQuestion?: {
      id: string;
      quote: string;
      correctAnswerId: string;
      correctAnswerName: string;
      sentAt: string;
      reactionCount: number;
    };
    hiddenChallenges?: Array<{
      teamId: string;
      teamName: string;
      challengeTitle: string | null;
      selected: boolean;
    }>;
  };
}
