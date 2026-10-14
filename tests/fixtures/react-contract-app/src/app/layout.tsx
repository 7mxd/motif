import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Larder",
  description: "Your neighbourhood grocer, delivered.",
};

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
