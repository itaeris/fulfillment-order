import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cermin Jubelio - Aeris Beaute",
};

export default function CerminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
