export const DEFAULT_TITLE = "Who Said That?";
export const DEFAULT_TEAM_COUNT = 4;
export const MIN_TEAM_COUNT = 3;
export const MAX_TEAM_COUNT = 8;
export const SOFT_PLAYER_CAP = 31;

export const DEFAULT_ROOM_SETTINGS = {
  rounds: 8,
  questionTimerSeconds: 25,
  challengeSelectionSeconds: 8,
  savingGraceCategorySeconds: 5,
  savingGraceAnswerSeconds: 10,
  lambSelectionSeconds: 5,
  consequenceChoiceSeconds: 8,
  bottleFlipSeconds: 3,
} as const;

export const TEAM_PALETTE = [
  { name: "Team Neon", color: "#00D1FF", icon: "N" },
  { name: "Team Solar", color: "#FFC857", icon: "S" },
  { name: "Team Flux", color: "#8B5CF6", icon: "F" },
  { name: "Team Pulse", color: "#FF4D8D", icon: "P" },
  { name: "Team Lime", color: "#7ED957", icon: "L" },
  { name: "Team Ember", color: "#FF7A1A", icon: "E" },
  { name: "Team Aqua", color: "#2DD4BF", icon: "A" },
  { name: "Team Volt", color: "#F5E642", icon: "V" },
] as const;

export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function getJoinUrl(roomCode: string) {
  return `${getAppUrl().replace(/\/$/, "")}/join?room=${encodeURIComponent(roomCode)}`;
}
