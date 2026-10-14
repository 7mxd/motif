"use client";
import { motion } from "motion/react";
import { useState } from "react";

export function PromoBanner() {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <section className="relative rounded-lg bg-[#F5E6D3] px-6 py-8 text-center">
      <motion.p animate={{ y: [0, -6, 0] }} transition={{ duration: 0.6, repeat: Infinity }} className="font-label text-label">
        🔥 Hot deals this week
      </motion.p>
      <h2 className="mt-2 bg-linear-to-r from-action-primary to-warning bg-clip-text font-title text-title text-transparent">
        Fresh flavours, delivered
      </h2>
      <p className="mt-2 font-caption text-caption text-text-primary opacity-40">Offers end Sunday. Terms apply.</p>
      <button type="button" aria-label="Dismiss" onClick={() => setShown(false)} className="absolute end-2 top-2 size-5 p-0 text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        ×
      </button>
    </section>
  );
}
