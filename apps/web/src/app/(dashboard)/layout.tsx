"use client";

import { Nav } from "@/components/Nav";
import { useRequireAuth } from "@/lib/useAuth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth();

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Cargando...</div>;
  }

  return (
    <div className="flex min-h-screen">
      <Nav user={user} />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
