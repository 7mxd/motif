import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
