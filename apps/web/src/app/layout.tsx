import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lynkro Outbound",
  description: "Panel administrativo de llamadas salientes con IA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
