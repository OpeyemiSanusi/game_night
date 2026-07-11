import "server-only";

import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenHashesMatch(token: string, storedHash: string) {
  const provided = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");

  if (provided.length !== stored.length) {
    return false;
  }

  return timingSafeEqual(provided, stored);
}

export function makeRoomCode(length = 5) {
  let code = "";

  for (let index = 0; index < length; index += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }

  return code;
}
