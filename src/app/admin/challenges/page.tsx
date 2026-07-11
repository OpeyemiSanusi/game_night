import { StateBadge } from "@/components/StateBadge";

export default function ChallengesAdminPage() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl content-center gap-5 px-4 py-8">
      <div className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <StateBadge label="Admin" tone="yellow" />
          <StateBadge label="Challenges" tone="pink" />
        </div>
        <h1 className="text-3xl font-black text-white">Challenge Admin</h1>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/60">
          CRUD, safety moderation, import, export, and preview for challenge
          decks are scheduled for the admin phase. The starter migration already
          seeds a safe deck.
        </p>
      </div>
    </main>
  );
}
