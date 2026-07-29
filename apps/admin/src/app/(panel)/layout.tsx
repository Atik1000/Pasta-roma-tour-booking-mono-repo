import { RequireAuth } from '@/components/auth/require-auth';
import { AdminShell } from '@/components/layout/admin-shell';

/**
 * Wraps every authenticated admin screen. `/login` sits outside this group so
 * it renders without the sidebar and without the auth gate.
 */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AdminShell>{children}</AdminShell>
    </RequireAuth>
  );
}
