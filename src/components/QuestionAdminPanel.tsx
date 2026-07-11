"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

interface ImportResponse {
  pack?: { id: string; name: string };
  importedQuestions?: number;
  error?: string;
}

const SAMPLE_JSON = JSON.stringify(
  {
    name: "Sample Pack",
    description: "Replace these with real group-chat quotes.",
    questions: [
      {
        quote: "I am bringing snacks but nobody judge the flavor choice.",
        sentAt: "2026-07-10T20:15:00Z",
        answerOptions: [
          { id: "alex", name: "Alex" },
          { id: "maya", name: "Maya" },
          { id: "jordan", name: "Jordan" },
        ],
        correctAnswerId: "maya",
        nextSenderOptions: [
          { id: "alex", name: "Alex" },
          { id: "chris", name: "Chris" },
          { id: "jordan", name: "Jordan" },
        ],
        correctNextSenderId: "chris",
        reactionCount: 2,
        category: "sample",
        difficulty: 1,
        hostNote: "",
      },
    ],
  },
  null,
  2,
);

export function QuestionAdminPanel() {
  const [adminToken, setAdminToken] = useState(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem("wst_admin_token") || "",
  );
  const [jsonText, setJsonText] = useState(SAMPLE_JSON);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function saveAdminToken(value: string) {
    setAdminToken(value);
    window.localStorage.setItem("wst_admin_token", value);
  }

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setJsonText(await file.text());
  }

  async function importQuestions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const response = await fetch("/api/admin/questions/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(adminToken ? { "x-admin-token": adminToken } : {}),
        },
        body: JSON.stringify(parsed),
      });
      const payload = (await response.json()) as ImportResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Import failed.");
      }

      setMessage(
        `Imported ${payload.importedQuestions || 0} questions into ${payload.pack?.name || "pack"}.`,
      );
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "Import failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function exportQuestions() {
    const response = await fetch("/api/admin/questions/export", {
      headers: adminToken ? { "x-admin-token": adminToken } : {},
    });
    const payload = (await response.json()) as unknown;

    setJsonText(JSON.stringify(payload, null, 2));
  }

  return (
    <form
      onSubmit={importQuestions}
      className="grid gap-4 rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-4 sm:p-6"
    >
      <label className="grid gap-2">
        <span className="text-sm font-bold text-white/70">
          Admin token
        </span>
        <input
          value={adminToken}
          onChange={(event) => saveAdminToken(event.target.value)}
          placeholder="Optional in local dev, required when ADMIN_TOKEN is set"
          className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 font-semibold text-white outline-none"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-bold text-white/70">
          JSON file
        </span>
        <input
          type="file"
          accept="application/json,.json"
          onChange={loadFile}
          className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-semibold text-white"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-bold text-white/70">
          Question pack JSON
        </span>
        <textarea
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
          rows={18}
          className="min-h-80 rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-sm text-white outline-none"
        />
      </label>

      {message ? (
        <div className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 font-semibold text-emerald-100">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 font-semibold text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-13 rounded-2xl bg-cyan-300 px-5 font-black text-black disabled:opacity-60"
        >
          {isSubmitting ? "Importing..." : "Import Questions"}
        </button>
        <button
          type="button"
          onClick={exportQuestions}
          className="h-13 rounded-2xl bg-white/10 px-5 font-black text-white"
        >
          Export Current Data
        </button>
      </div>
    </form>
  );
}
