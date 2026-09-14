"use client";

import dynamic from "next/dynamic";

// The workspace lives in localStorage, so render it client-only instead of hydrating an empty shell.
const App = dynamic(() => import("./App"), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-screen place-items-center bg-ink-950">
      <div className="size-8 animate-pulse rounded-lg bg-gold-400/80" />
    </div>
  ),
});

export default function ClientApp() {
  return <App />;
}
