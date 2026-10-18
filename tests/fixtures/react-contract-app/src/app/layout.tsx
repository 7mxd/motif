import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Larder",
  description: "Your neighbourhood grocer, delivered.",
};

// The page runs under the iPhone's home indicator, so the tab bar's env(safe-area-inset-bottom) padding has an effect.
export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background font-body text-body text-text-primary">
        <Providers>
          <div className="flex min-h-dvh">
            <Sidebar />
            <div className="min-w-0 grow pb-16 md:pb-0">{children}</div>
          </div>
          <TabBar />
        </Providers>
      </body>
    </html>
  );
}
