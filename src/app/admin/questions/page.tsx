import { StateBadge } from "@/components/StateBadge";
import { QuestionAdminPanel } from "@/components/QuestionAdminPanel";

export default function QuestionsAdminPage() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl content-center gap-5 px-4 py-8">
      <div className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <StateBadge label="Admin" tone="yellow" />
          <StateBadge label="Questions" tone="cyan" />
        </div>
        <h1 className="text-3xl font-black text-white">Question Admin</h1>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/60">
          Import a JSON pack with quote, sender options, correct sender,
          timestamp, next sender, and reaction count. Those fields power the
          main question and all three Saving Grace categories.
        </p>
      </div>
      <QuestionAdminPanel />
    </main>
  );
}
