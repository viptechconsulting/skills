"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import type { CurrentUser } from "@/lib/useAuth";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Analítica" },
  { href: "/campaigns", label: "Campañas" },
  { href: "/prospects", label: "Prospectos" },
  { href: "/calls", label: "Llamadas" },
  { href: "/dnc", label: "Do Not Call" },
  { href: "/phone-numbers", label: "Números" },
  { href: "/voice-agents", label: "Agentes de voz" },
  { href: "/integrations", label: "Integraciones" },
];

export function Nav({ user }: { user: CurrentUser | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await api.post("/auth/logout");
    router.push("/login");
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-lg font-semibold text-brand-600">Lynkro Outbound</p>
        {user && <p className="mt-1 truncate text-xs text-slate-500">{user.email}</p>}
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <button onClick={handleLogout} className="btn-secondary w-full">
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
