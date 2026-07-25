import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "GS log in/Log out monitoring",
  description: "Online log in log out attendance monitoring system with 8-hour shift calculation, overtime, undertime tracking, spreadsheet export, and employee portal.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased font-sans">
        {/* Ambient Glow Spheres */}
        <div className="glow-sphere glow-1" aria-hidden="true" />
        <div className="glow-sphere glow-2" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
