import { useState } from 'react';
import { Save, Mail, Phone, Calendar, Shield, Lock, CheckCircle2, Monitor, Key, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/store/auth.ts';
import { Avatar } from '@/components/atoms/Avatar.tsx';
import { ErrorNotice, errorText } from '@/components/admin/AdminShared.tsx';
import { cn } from '@/lib/utils.ts';
import api from '@/lib/api.ts';

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';
const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

export function AdminProfilePage() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin);

  /*
   * Employees keep `role: 'user'` on their account — their access comes from the
   * assigned role, so that is what belongs here. Showing the raw account type
   * would read "user" to a Cashier, which is both wrong and alarming.
   */
  const staffRole = user?.staffRole;
  const roleLabel =
    (typeof staffRole === 'object' && staffRole?.name) ||
    (isSuperAdmin ? 'Super Admin' : '') ||
    user?.designation ||
    'Staff';

  const [isSaving, setIsSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Profile form
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [bio, setBio] = useState('');

  // Password form
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    setIsSaving(true);
    setProfileSaved(false);
    setProfileError('');
    try {
      // Your own details go through the self-service route. /admin/users/:id is
      // the Customers screen's, so any role without Customers was refused — and
      // the refusal was swallowed, so the page just looked like it saved.
      await api.put('/auth/profile', { displayName: displayName.trim(), phone: phone.trim() });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err) {
      setProfileError(errorText(err, 'Your details could not be saved. Please try again.'));
      return;
    } finally {
      setIsSaving(false);
    }
    // The header and sidebar read the signed-in user from the store; refresh it
    // so the new name shows without a reload. Not being able to re-read is not a
    // failed save, so it stays quiet.
    try {
      const { getMe } = await import('@/services/auth.ts');
      useAuthStore.getState().setUser(await getMe());
    } catch {
      /* the save itself succeeded */
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ text: 'Passwords do not match', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ text: 'Password must be at least 6 characters', type: 'error' });
      return;
    }
    setIsChangingPassword(true);
    setPasswordMessage(null);
    try {
      const { changePassword } = await import('@/services/auth.ts');
      await changePassword(currentPassword, newPassword);
      setPasswordMessage({ text: 'Password changed successfully', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPasswordMessage({ text: 'Failed. Check your current password.', type: 'error' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const joinedDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className="space-y-6">
      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Editable forms (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <form onSubmit={handleProfileSave}>
            <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800">
              <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-surface-800">
                <h2 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
                  Personal Information
                </h2>
                <div className="flex items-center gap-3">
                  {profileSaved && (
                    <span className="flex items-center gap-1.5 text-body-sm text-green-600 dark:text-green-400 font-medium">
                      <CheckCircle2 size={15} /> Saved
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shadow-brand-500/20"
                  >
                    <Save size={15} />
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <ErrorNotice message={profileError} onDismiss={() => setProfileError('')} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Full Name</label>
                    <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <input type="email" value={user?.email || ''} disabled className={`${inputClass} opacity-60 cursor-not-allowed`} />
                    <p className="text-caption text-surface-400 mt-1">Email cannot be changed</p>
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="+91..." />
                  </div>
                  <div>
                    <label className={labelClass}>Role</label>
                    <input type="text" value={roleLabel} disabled className={`${inputClass} opacity-60 cursor-not-allowed`} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Bio</label>
                    <textarea value={bio} onChange={(e) => setBio(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="A short bio about yourself..." />
                  </div>
                </div>
              </div>
            </div>
          </form>

          {/* Change Password */}
          <form onSubmit={handlePasswordChange}>
            <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800">
              <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-surface-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Lock size={16} className="text-amber-600" />
                  </div>
                  <div>
                    <h2 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50">
                      Change Password
                    </h2>
                    <p className="text-caption text-surface-400">Update your account password</p>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="flex items-center gap-2 px-4 h-9 rounded-lg bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-[13px] font-semibold hover:bg-surface-800 dark:hover:bg-surface-200 disabled:opacity-50 transition-colors"
                >
                  <Key size={15} />
                  {isChangingPassword ? 'Changing...' : 'Update Password'}
                </button>
              </div>
              <div className="p-5">
                {passwordMessage && (
                  <div className={cn(
                    'p-3 rounded-xl text-body-sm font-medium mb-4',
                    passwordMessage.type === 'success'
                      ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
                  )}>
                    {passwordMessage.text}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Current Password</label>
                    <div className="relative">
                      <input type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={`${inputClass} pr-10`} required />
                      <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors" tabIndex={-1}>
                        {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>New Password</label>
                    <div className="relative">
                      <input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={`${inputClass} pr-10`} required minLength={6} />
                      <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors" tabIndex={-1}>
                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Confirm Password</label>
                    <div className="relative">
                      <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={`${inputClass} pr-10`} required />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors" tabIndex={-1}>
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Right — Account overview (1/3) */}
        <div className="flex flex-col gap-6">
          {/* Account Card */}
          <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-5">
            <div className="flex flex-col items-center text-center">
              <Avatar src={user?.photoURL} name={user?.displayName || ''} size="lg" />
              <h3 className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50 mt-3">
                {user?.displayName || 'Admin'}
              </h3>
              <p className="text-body-sm text-surface-400 mt-0.5">{user?.email}</p>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-caption font-medium capitalize bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400 mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                {roleLabel}
              </span>
            </div>

            <div className="mt-5 pt-4 border-t border-surface-100 dark:border-surface-800 space-y-3">
              <div className="flex items-center gap-3 text-body-sm">
                <Mail size={15} className="text-surface-400 flex-shrink-0" />
                <span className="text-surface-600 dark:text-surface-400 truncate">{user?.email}</span>
              </div>
              {user?.phone && (
                <div className="flex items-center gap-3 text-body-sm">
                  <Phone size={15} className="text-surface-400 flex-shrink-0" />
                  <span className="text-surface-600 dark:text-surface-400">{user.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-body-sm">
                <Calendar size={15} className="text-surface-400 flex-shrink-0" />
                <span className="text-surface-600 dark:text-surface-400">Joined {joinedDate}</span>
              </div>
            </div>
          </div>

          {/* Security Status */}
          <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-5 flex-1">
            <h3 className="font-display font-semibold text-body-sm text-surface-900 dark:text-surface-50 mb-3">Security</h3>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-green-50 dark:bg-green-500/10">
                <div className="w-7 h-7 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <Shield size={14} className="text-green-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-surface-700 dark:text-surface-200">Authenticated</p>
                  <p className="text-caption text-surface-400">Email & Google sign-in</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-500/10">
                <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Monitor size={14} className="text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-surface-700 dark:text-surface-200">Active Session</p>
                  <p className="text-caption text-surface-400">This device · Now</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
