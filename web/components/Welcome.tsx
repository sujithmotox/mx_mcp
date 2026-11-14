"use client";

import { Car, ClipboardCheck, Filter, Gavel, TrendingUp, Wallet } from "lucide-react";
import { Logo } from "./Logo";
import { SUGGESTIONS } from "./suggestions";

const ICONS = { gavel: Gavel, trending: TrendingUp, wallet: Wallet, funnel: Filter, clipboard: ClipboardCheck, car: Car };

export function Welcome({ onPick }: { onPick: (q: string) => void }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pb-10 pt-[12vh] text-center">
      <Logo className="size-12 rounded-xl" />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting}. What do you want to know?</h1>
      <p className="mt-2 max-w-md text-muted">
        Ask in plain English. Answers come straight from your database, with the queries shown so you can check them.
      </p>
      <div className="mt-8 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
        {SUGGESTIONS.map((s) => {
          const Icon = ICONS[s.icon];
          return (
            <button
              key={s.title}
              type="button"
              onClick={() => onPick(s.prompt)}
              className="group rounded-xl border border-line bg-panel p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand/60 hover:shadow-md"
            >
              <div className="mb-3 grid size-8 place-items-center rounded-lg bg-brand-soft text-brand">
                <Icon className="size-4" />
              </div>
              <div className="font-medium">{s.title}</div>
              <div className="mt-1 line-clamp-2 text-sm text-muted">{s.prompt}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
