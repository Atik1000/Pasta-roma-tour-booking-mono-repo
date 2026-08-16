'use client';

import { PageHeader } from '@/components/layout/admin-shell';
import { ProfileForm } from '@/components/auth/profile-form';

export default function ProfilePage() {
  return (
    <>
      <PageHeader
        title="My Profile"
        description="Update your account details and change your password."
      />
      <ProfileForm />
    </>
  );
}
