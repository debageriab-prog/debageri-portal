import { PortalShell } from "@/components/layout/PortalShell";
export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalShell>{children}</PortalShell>;
}
