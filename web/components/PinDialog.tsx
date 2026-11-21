"use client";

import { Loader2, Pin, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { WidgetSettings } from "@/lib/dashboard";

type Option<T extends string> = { value: T; label: string };

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Option<T>[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm transition ${value === o.value ? "bg-panel font-medium text-fg shadow-sm" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <div className="text-sm font-medium">{label}</div>
    {children}
    {hint && <p className="text-xs text-muted">{hint}</p>}
  </div>
);

/** Pin a chart to the dashboard, or edit a pinned widget's settings. */
export function PinDialog({
  mode,
  initial,
  onSubmit,
  onClose,
  hasDates,
  allowNumber = true,
}: {
  /** Only bar/line/area/pie/combo/funnel charts can become a number tile. */
  allowNumber?: boolean;
  /** The chart's query uses fixed dates, so they can move forward each day. */
  hasDates?: boolean;
  mode: "pin" | "edit";
  initial: WidgetSettings;
  onSubmit: (s: WidgetSettings) => Promise<void>;
  onClose: () => void;
}) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof WidgetSettings>(k: K, v: WidgetSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!s.title.trim()) return setError("Give the widget a title.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ ...s, title: s.title.trim() });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={mode === "pin" ? "Pin to dashboard" : "Edit widget"}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-5 rounded-2xl border border-line bg-panel p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{mode === "pin" ? "Pin to dashboard" : "Edit widget"}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <Field label="Title">
          <input
            value={s.title}
            autoFocus
            maxLength={120}
            onChange={(e) => set("title", e.target.value)}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 outline-none focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
          />
        </Field>

        {allowNumber && <Field label="Show as">
          <Segmented
            value={s.display}
            onChange={(v) => setS((p) => ({ ...p, display: v, size: v === "number" && p.size === "lg" ? "sm" : p.size }))}
            options={[
              { value: "chart", label: "Chart" },
              { value: "number", label: "Number tile" },
            ]}
          />
        </Field>}

        {allowNumber && s.display === "number" && (
          <Field label="Number" hint="Uses the first series. The small line under it shows the trend.">
            <Segmented
              value={s.numberMode}
              onChange={(v) => set("numberMode", v)}
              options={[
                { value: "last", label: "Latest value" },
                { value: "total", label: "Total" },
              ]}
            />
          </Field>
        )}

        <Field label="Size">
          <Segmented
            value={s.size}
            onChange={(v) => set("size", v)}
            options={[
              { value: "sm", label: "Small" },
              { value: "md", label: "Medium" },
              { value: "lg", label: "Wide" },
            ]}
          />
        </Field>

        <Field label="Refresh" hint="Every widget also refreshes when you open the dashboard.">
          <Segmented
            value={s.refresh}
            onChange={(v) => set("refresh", v)}
            options={[
              { value: "open", label: "On open" },
              { value: "5m", label: "Every 5 min" },
              { value: "1h", label: "Hourly" },
            ]}
          />
        </Field>

        {hasDates && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5">
            <input
              type="checkbox"
              checked={s.rollDates !== false}
              onChange={(e) => set("rollDates", e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--brand)]"
            />
            <span>
              <span className="block text-sm font-medium">Keep dates moving</span>
              <span className="block text-xs text-muted">
                The query uses fixed dates. Slide them forward each day, so a 6–20 Nov chart shows 7–21 Nov tomorrow. Turn off to keep exactly these dates.
              </span>
            </span>
          </label>
        )}

        {error && <p className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-panel-2 hover:text-fg">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg shadow-sm transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : mode === "pin" ? <Pin className="size-4" /> : null}
            {mode === "pin" ? (busy ? "Checking query…" : "Pin") : busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
