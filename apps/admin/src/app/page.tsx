import { redirect } from 'next/navigation';

/** The panel opens on the dashboard. */
export default function AdminRootPage() {
  redirect('/dashboard');
}
