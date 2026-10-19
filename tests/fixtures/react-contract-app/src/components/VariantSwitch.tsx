"use client";
import { useEffect, useState } from "react";
import { Switch } from "./Switch";

const KEY = "larder-variant";

/** Chooses the partner store's look: sets data-variant on <html>, next to data-theme, and remembers it. */
export function VariantSwitch() {
  const [partner, setPartner] = useState(false);
  useEffect(() => setPartner(document.documentElement.dataset.variant === "partner"), []);

  function choose(on: boolean) {
    setPartner(on);
    if (on) document.documentElement.dataset.variant = "partner";
    else delete document.documentElement.dataset.variant;
    try {
      if (on) localStorage.setItem(KEY, "partner");
      else localStorage.removeItem(KEY);
    } catch {
      // Private windows can refuse storage; the choice then lasts until the page closes.
    }
  }

  return <Switch label="Partner store look" description="Use the colours of your partner store" checked={partner} onCheckedChange={choose} />;
}
