import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Server-side role re-check (AGENTS §8.7): middleware gates too — this is
// defense in depth, UI hiding is never the security boundary.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/prijava");
  }
  return <div className="min-h-screen bg-light-4">{children}</div>;
}
