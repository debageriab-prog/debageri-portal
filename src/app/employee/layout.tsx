import { PortalShell } from "@/components/layout/PortalShell";
export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalShell>{children}</PortalShell>;
}
