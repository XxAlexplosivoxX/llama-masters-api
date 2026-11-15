import type { ReactNode } from "react";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";

/** The frame of a legal page: its content is plain headings, paragraphs and lists (see `.legal`). */
export function Layout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="legal mx-auto max-w-2xl px-5 pb-24 pt-32 sm:px-8">
        <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm">Last updated {updated}</p>
        {children}
      </main>
      <Footer />
    </div>
  );
}
