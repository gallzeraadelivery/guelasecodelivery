"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AdminSessionProvider, useAdminSession } from "@/context/session";
import { supabase } from "@/lib/supabase";

const NAV_ITEMS = [
  { href: "/dashboard/financeiro", label: "Financeiro" },
  { href: "/dashboard/configuracoes", label: "Configurações" },
  { href: "/dashboard/auditoria", label: "Auditoria" },
  { href: "/dashboard/antifraude", label: "Antifraude" },
];

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAdminSession();
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-black">
      <aside className="w-56 shrink-0 bg-brand-red p-4">
        <h1 className="mb-6 text-sm font-bold tracking-wide text-brand-yellow">GUELA SECO Admin</h1>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded px-3 py-2 text-sm font-medium ${
                pathname === item.href
                  ? "bg-brand-yellow text-brand-red-dark"
                  : "text-white/90 hover:bg-white/10"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={handleSignOut}
          className="mt-8 text-sm text-white/80 hover:text-white hover:underline"
        >
          Sair
        </button>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminSessionProvider>
      <DashboardShell>{children}</DashboardShell>
    </AdminSessionProvider>
  );
}
