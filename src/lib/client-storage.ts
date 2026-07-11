"use client";

export function hostTokenKey(roomCode: string) {
  return `wst_host_${roomCode.toUpperCase()}`;
}

export function playerTokenKey(roomCode: string) {
  return `wst_player_${roomCode.toUpperCase()}`;
}

export function readStoredToken(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(key);
}

export function writeStoredToken(key: string, token: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, token);
}
