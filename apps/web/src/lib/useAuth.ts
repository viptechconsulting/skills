"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "./apiClient";

export interface CurrentUser {
  userId: string;
  email: string;
  role: "owner" | "admin" | "agent";
  organizationId: string;
}

export function useRequireAuth(): { user: CurrentUser | null; loading: boolean } {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .get<CurrentUser>("/auth/me")
      .then((data) => {
        if (active) setUser(data);
      })
      .catch((error) => {
        if (error instanceof ApiError && active) {
          router.replace("/login");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  return { user, loading };
}
