import Link from "next/link";
import { CreateRoomForm } from "@/components/CreateRoomForm";
import { StateBadge } from "@/components/StateBadge";

export default function Home() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-7xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
      <section className="grid gap-6">
        <div className="flex flex-wrap gap-2">
          <StateBadge label="Realtime" tone="cyan" />
          <StateBadge label="3-8 Teams" tone="yellow" />
          <StateBadge label="No Accounts" tone="pink" />
        </div>
        <div>
          <h1 className="max-w-4xl text-5xl font-black leading-[0.95] text-white sm:text-7xl">
            Who Said That?
          </h1>
          <p className="mt-5 max-w-2xl text-lg font-semibold leading-8 text-white/62">
            Run a live party game where players guess who sent a real group-chat
            quote. Create the room here, then send players to the join screen
            and open the display on a TV.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Players", "30+"],
            ["Team mode", "Flexible"],
            ["Install", "None"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] px-4 py-4"
            >
              <div className="text-xs font-black uppercase tracking-[0.22em] text-white/40">
                {label}
              </div>
              <div className="mt-2 text-2xl font-black text-white">{value}</div>
            </div>
          ))}
        </div>

        <Link
          href="/join"
          className="inline-flex h-13 w-full items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-5 text-base font-black text-white sm:w-fit"
        >
          Join Existing Room
        </Link>
      </section>

      <section>
        <CreateRoomForm />
      </section>
    </main>
  );
}
