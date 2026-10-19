"use client";

import dynamic from "next/dynamic";

const AppShell = dynamic(() => import("@/components/AppShell"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center">
      <div className="flex items-center gap-3 text-soft">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading PdfEditz…
      </div>
    </div>
  ),
});

export default function Page() {
  return <AppShell />;
}