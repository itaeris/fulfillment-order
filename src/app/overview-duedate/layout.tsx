import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kirim hari ini - Aeris Beaute",
};

export default function OverviewDueDateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
