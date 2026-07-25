import { PortalShell } from "@/components/layout/PortalShell";
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalShell>{children}</PortalShell>;
}
