"use client";

import { useState } from "react";
import type { PlayerPublic } from "@/lib/types";

interface AvatarProps {
  player: Pick<PlayerPublic, "displayName" | "initials" | "avatarUrl">;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-lg",
};

export function Avatar({ player, size = "md" }: AvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const avatarUrl =
    player.avatarUrl && failedUrl !== player.avatarUrl ? player.avatarUrl : null;

  return (
    <div
      className={`${sizeClasses[size]} grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/20 bg-white/10 font-black text-white shadow-[0_0_20px_rgba(255,255,255,0.08)]`}
      aria-label={player.displayName}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          onError={() => setFailedUrl(avatarUrl)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{player.initials}</span>
      )}
    </div>
  );
}
