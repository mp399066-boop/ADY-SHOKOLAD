'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

type UserRole = 'admin' | 'staff' | 'delivery';

interface AuthorizedUser {
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string | null;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'מנהל',
  staff: 'צוות',
  delivery: 'שליח',
};

const SETTINGS_TABS = [
  { href: '/settings',       label: 'הגדרות עסק'      },
  { href: '/settings/users', label: 'משתמשים והרשאות' },
];

function SettingsTabs({ active }: { active: string }) {
  return (
    <div className="flex gap-1 mb-6 border-b" style={{ borderColor: '#EAE0D4' }}>
      {SETTINGS_TABS.map(tab => {
        const isActive = active === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-4 py-2.5 text-sm font-medium relative transition-colors"
            style={isActive
              ? { color: '#5C3410', borderBottom: '2.5px solid #C9A46A', marginBottom: '-1px' }
              : { color: '#8A7664' }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<UserRole>('staff');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const meRes = await fetch('/api/me');
      if (!meRes.ok) { router.push('/login'); return; }
      const me = await meRes.json();
      setCurrentRole(me.role);
      if (me.role !== 'admin') { setLoading(false); return; }
      await loadUsers();
      setLoading(false);
    }
    init();
  }, [router]);

  async function loadUsers() {
    const res = await fetch('/api/users');
    if (!res.ok) return;
    const json = await res.json();
    setUsers(json.data ?? []);
  }

  async function handleAdd() {
    setAddError('');
    const emailTrimmed = addEmail.trim().toLowerCase();
    if (!emailTrimmed) { setAddError('אימייל חובה'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setAddError('כתובת אימייל לא תקינה');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailTrimmed, role: addRole }),
      });
      const json = await res.json();
      if (!res.ok) { setAddError(json.error || 'שגיאה'); return; }
      setUsers(prev => [...prev, json.data]);
      setAddEmail('');
      setAddRole('staff');
      toast.success('משתמש נוסף בהצלחה');
    } catch {
      setAddError('שגיאה בהוספת משתמש');
    } finally {
      setAdding(false);
    }
  }

  async function handlePatch(id: string, updates: { role?: UserRole; is_active?: boolean }) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'שגיאה בעדכון');
        return;
      }
      setUsers(prev => prev.map(u => (u.id === id ? json.data : u)));
      toast.success('עודכן בהצלחה');
    } catch {
      toast.error('שגיאה בעדכון');
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) return <PageLoading />;

  if (currentRole !== 'admin') {
    return (
      <div className="max-w-3xl">
        <SettingsTabs active="/settings/users" />
        <Card>
          <div className="py-10 text-center space-y-2">
            <p className="text-base font-medium" style={{ color: '#3A2A1A' }}>
              אין לך הרשאה לניהול משתמשים
            </p>
            <p className="text-sm" style={{ color: '#8A7664' }}>
              רק מנהלים יכולים לגשת לעמוד זה
            </p>
            <div className="mt-4">
              <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
                חזרה לדשבורד
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5" dir="rtl">
      <SettingsTabs active="/settings/users" />

      {/* Info card */}
      <Card style={{ backgroundColor: '#FAF7F0', border: '1px solid #EAE0D4' }}>
        <div className="flex gap-3 items-start">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ backgroundColor: '#EFE4D3', color: '#8B5E34' }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: '#6B4A2D' }}>
            משתמש יוכל להיכנס למערכת רק אם המייל שלו מופיע כאן והוא פעיל.
            הרשמה עם Google לא מספיקה — יש לאשר כל משתמש ידנית.
          </p>
        </div>
      </Card>

      {/* Add user */}
      <Card>
        <CardHeader><CardTitle>הוספת משתמש חדש</CardTitle></CardHeader>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-48">
            <Input
              label="אימייל"
              type="email"
              placeholder="user@example.com"
              value={addEmail}
              onChange={e => { setAddEmail(e.target.value); setAddError(''); }}
              error={addError}
              dir="ltr"
            />
          </div>
          <div className="w-36">
            <Select
              label="תפקיד"
              value={addRole}
              onChange={e => setAddRole(e.target.value as UserRole)}
            >
              <option value="staff">צוות</option>
              <option value="admin">מנהל</option>
              <option value="delivery">שליח</option>
            </Select>
          </div>
          <Button onClick={handleAdd} loading={adding} className="mb-0.5">
            הוסף משתמש
          </Button>
        </div>
      </Card>

      {/* Users table */}
      <Card>
        <CardHeader>
          <CardTitle>משתמשים מורשים ({users.length})</CardTitle>
        </CardHeader>

        {users.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: '#8A7664' }}>
            אין משתמשים
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #EAE0D4' }}>
                  {['אימייל', 'תפקיד', 'סטטוס', 'תאריך הוספה', 'פעולות'].map(h => (
                    <th
                      key={h}
                      className="text-right py-2 px-3 text-xs font-medium"
                      style={{ color: '#8A7664' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const isUpdating = updatingId === user.id;
                  return (
                    <tr
                      key={user.id}
                      style={{ borderBottom: '1px solid #F5EFE7' }}
                      className="transition-colors hover:bg-[#FDFAF6]"
                    >
                      {/* Email */}
                      <td className="py-3 px-3" dir="ltr" style={{ color: '#3A2A1A', fontFamily: 'monospace', fontSize: '12px' }}>
                        {user.email}
                      </td>

                      {/* Role select */}
                      <td className="py-3 px-3">
                        <select
                          value={user.role}
                          disabled={isUpdating}
                          onChange={e => handlePatch(user.id, { role: e.target.value as UserRole })}
                          className="text-xs rounded-md border px-2 py-1 bg-white transition-all"
                          style={{ borderColor: '#E8DED2', color: '#3A2A1A' }}
                        >
                          <option value="staff">צוות</option>
                          <option value="admin">מנהל</option>
                          <option value="delivery">שליח</option>
                        </select>
                      </td>

                      {/* Active toggle */}
                      <td className="py-3 px-3">
                        <button
                          disabled={isUpdating}
                          onClick={() => handlePatch(user.id, { is_active: !user.is_active })}
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-opacity"
                          style={user.is_active
                            ? { backgroundColor: '#E8F5EE', color: '#2A7A4F' }
                            : { backgroundColor: '#FDE8E7', color: '#A0362C' }
                          }
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: user.is_active ? '#2A7A4F' : '#A0362C' }}
                          />
                          {user.is_active ? 'פעיל' : 'מושבת'}
                        </button>
                      </td>

                      {/* Created date */}
                      <td className="py-3 px-3 text-xs" style={{ color: '#8A7664' }}>
                        {user.created_at
                          ? new Date(user.created_at).toLocaleDateString('he-IL', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3">
                        {isUpdating && (
                          <span className="text-xs" style={{ color: '#8A7664' }}>
                            שומר...
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Role legend */}
      <Card>
        <CardHeader><CardTitle>הסבר תפקידים</CardTitle></CardHeader>
        <div className="space-y-2">
          {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([role, label]) => (
            <div key={role} className="flex items-start gap-3">
              <span
                className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 mt-0.5"
                style={{ backgroundColor: '#EFE4D3', color: '#5C3410' }}
              >
                {label}
              </span>
              <p className="text-xs" style={{ color: '#6B5544' }}>
                {role === 'admin' && 'גישה מלאה לכל המערכת, כולל ניהול משתמשים'}
                {role === 'staff' && 'גישה מלאה למערכת, ללא ניהול משתמשים'}
                {role === 'delivery' && 'גישה מוגבלת לעדכון סטטוס משלוחים בלבד'}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
