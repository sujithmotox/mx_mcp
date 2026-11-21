"use client";

import { useEffect } from "react";
import type { DateRange, Widget } from "@/lib/dashboard";
import { WidgetCard } from "./WidgetCard";

export function EmbedWidget({ widget, token, theme, range }: { widget: Widget; token: string; theme?: "dark" | "light"; range: DateRange | null }) {
  useEffect(() => {
    if (theme) document.documentElement.classList.toggle("dark", theme === "dark");
    document.body.style.background = "transparent";
  }, [theme]);
  return (
    <div className="h-dvh p-1">
      <WidgetCard widget={widget} range={range} token={token} />
    </div>
  );
}
