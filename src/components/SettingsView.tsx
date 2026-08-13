"use client";

import { useState, useEffect, useRef, useCallback, FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  User,
  Lock,
  Users,
  Eye,
  EyeOff,
  CheckCircle,
  Trash2,
  Plus,
  Shield,
  Warehouse,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
import { useAuth, type UserProfile, type UserRole } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type SettingsTab = "profile" | "password" | "users";

interface AllUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export default function SettingsView() {
  const { profile, updatePassword } = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsTab>("profile");

  const sections: { id: SettingsTab; label: string; icon: any; adminOnly?: boolean }[] = [
    { id: "profile", label: "Profil", icon: User },
    { id: "password", label: "Ubah Password", icon: Lock },
    { id: "users", label: "Kelola User", icon: Users, adminOnly: true },
  ];

  const visibleSections = sections.filter(
    (s) => !s.adminOnly || profile?.role === "admin"
  );

  return (
    <div className="max-w-4xl space-y-6">
      {/* Section Tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {visibleSections.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                isActive
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-white text-brand-500 border border-brand-200 hover:bg-cream-100"
              )}
            >
              <section.icon className="w-4 h-4" />
              {section.label}
            </button>
          );
        })}
      </div>

      {activeSection === "profile" && <ProfileSection />}
      {activeSection === "password" && <PasswordSection />}
      {activeSection === "users" && profile?.role === "admin" && <UserManagementSection />}
    </div>
  );
}

function ProfileSection() {
  const { profile } = useAuth();
  const [name, setName] = useState(profile?.name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!name.trim() || !username.trim()) {
      setError("Nama dan username wajib diisi");
      return;
    }

    setSaving(true);
    const { error: dbError } = await supabase
      .from("profiles")
      .update({ name: name.trim(), username: username.trim() })
      .eq("id", profile!.id);

    setSaving(false);

    if (dbError) {
      setError(dbError.message.includes("unique") ? "Username sudah dipakai" : dbError.message);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-brand-200 p-6">
      <h3 className="text-lg font-semibold text-brand-800 mb-5">Profil Saya</h3>
      <form onSubmit={handleSave} className="space-y-4 max-w-md">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-600 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Profil berhasil diperbarui
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-brand-700 mb-1.5">Nama</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 border border-brand-200 rounded-xl text-sm text-brand-800 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-700 mb-1.5">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-2.5 border border-brand-200 rounded-xl text-sm text-brand-800 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-700 mb-1.5">Email</label>
          <input
            type="text"
            value={profile?.email ?? ""}
            disabled
            className="w-full px-4 py-2.5 border border-brand-200 rounded-xl text-sm text-brand-400 bg-cream-200 cursor-not-allowed"
          />
          <p className="text-[11px] text-brand-300 mt-1">Email tidak bisa diubah</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-700 mb-1.5">Role</label>
          <div className="flex items-center gap-2 px-4 py-2.5 border border-brand-200 rounded-xl bg-cream-200">
            {profile?.role === "admin" ? (
              <Shield className="w-4 h-4 text-brand-600" />
            ) : (
              <Warehouse className="w-4 h-4 text-brand-500" />
            )}
            <span className="text-sm text-brand-600 font-medium">
              {profile?.role === "admin" ? "Admin" : "Warehouse"}
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-all flex items-center gap-2"
        >
          {saving ? <Spinner /> : null}
          Simpan Perubahan
        </button>
      </form>
    </div>
  );
}

function PasswordSection() {
  const { updatePassword } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!newPassword || !confirmPassword) {
      setError("Semua field wajib diisi");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password minimal 6 karakter");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Password tidak cocok");
      return;
    }

    setSaving(true);
    const { error: updateError } = await updatePassword(newPassword);
    setSaving(false);

    if (updateError) {
      setError(updateError);
    } else {
      setSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-brand-200 p-6">
      <h3 className="text-lg font-semibold text-brand-800 mb-5">Ubah Password</h3>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-600 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Password berhasil diubah
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-brand-700 mb-1.5">Password Baru</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              className="w-full px-4 py-2.5 pr-12 border border-brand-200 rounded-xl text-sm text-brand-800 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-brand-300 hover:text-brand-500"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-700 mb-1.5">Konfirmasi Password</label>
          <input
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Ulangi password baru"
            className="w-full px-4 py-2.5 border border-brand-200 rounded-xl text-sm text-brand-800 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-all flex items-center gap-2"
        >
          {saving ? <Spinner /> : null}
          Ubah Password
        </button>
      </form>
    </div>
  );
}

function ConfirmModal({
  open,
  title,
  message,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-brand-200 p-6 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <h3 className="text-base font-semibold text-brand-800">{title}</h3>
        </div>
        <p className="text-sm text-brand-500 mb-6">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium text-brand-600 bg-cream-100 hover:bg-cream-200 transition-all"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-all"
          >
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

function UserManagementSection() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<AllUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AllUser | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });

    if (data && !error) {
      setUsers(data as AllUser[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleDeleteUser = async (userId: string) => {
    if (userId === profile?.id) return;

    const { error } = await supabase.from("profiles").delete().eq("id", userId);
    if (!error) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    }
    setDeleteTarget(null);
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (userId === profile?.id) return;

    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);

    if (!error) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* User List */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-brand-800">Kelola User</h3>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
              showAddForm
                ? "bg-cream-200 text-brand-500"
                : "bg-brand-600 text-white hover:bg-brand-700"
            )}
          >
            <Plus className="w-4 h-4" />
            {showAddForm ? "Batal" : "Tambah User"}
          </button>
        </div>

        {showAddForm && (
          <AddUserForm
            onSuccess={() => {
              setShowAddForm(false);
              loadUsers();
            }}
          />
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="loader" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-cream-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-brand-400 uppercase">Nama</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-brand-400 uppercase">Username</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-brand-400 uppercase">Email</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-brand-400 uppercase">Role</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-brand-400 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {users.map((u) => {
                  const isSelf = u.id === profile?.id;
                  return (
                    <tr key={u.id} className="hover:bg-cream-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-brand-800">{u.name}</span>
                          {isSelf && (
                            <span className="text-[10px] bg-brand-100 text-brand-600 px-1.5 py-0.5 rounded-full font-medium">
                              Kamu
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-brand-500 font-mono">{u.username}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-brand-500">{u.email}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isSelf ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-100 text-brand-700">
                            <Shield className="w-3 h-3" />
                            Admin
                          </span>
                        ) : (
                          <RoleDropdown
                            value={u.role}
                            onChange={(newRole) => handleRoleChange(u.id, newRole)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {!isSelf && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="p-2 rounded-lg text-brand-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Hapus user"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="Hapus User"
        message={`Yakin hapus user "${deleteTarget?.name}" (${deleteTarget?.email})?`}
        onConfirm={() => deleteTarget && handleDeleteUser(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

const ROLE_OPTIONS: { value: UserRole; label: string; icon: typeof Shield }[] = [
  { value: "admin", label: "Admin", icon: Shield },
  { value: "warehouse", label: "Warehouse", icon: Warehouse },
];

function RoleDropdown({
  value,
  onChange,
}: {
  value: UserRole;
  onChange: (role: UserRole) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const current = ROLE_OPTIONS.find((o) => o.value === value)!;

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      left: rect.left + rect.width / 2 - 72,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        btnRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      )
        return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, updatePos]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => { updatePos(); setOpen(!open); }}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer",
          open
            ? "border-brand-500 ring-2 ring-brand-500/20 bg-white text-brand-700"
            : "border-brand-200 bg-cream-50 text-brand-700 hover:border-brand-300"
        )}
      >
        <current.icon className="w-3 h-3" />
        {current.label}
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed w-36 bg-white border border-brand-200 rounded-lg shadow-xl overflow-hidden"
            style={{ top: pos.top, left: pos.left, zIndex: 99999 }}
          >
            {ROLE_OPTIONS.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors",
                    isSelected
                      ? "bg-brand-600 text-white"
                      : "text-brand-700 hover:bg-cream-100"
                  )}
                >
                  <opt.icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

function AddUserForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("warehouse");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !username.trim() || !email.trim() || !password) {
      setError("Semua field wajib diisi");
      return;
    }
    if (password.length < 6) {
      setError("Password minimal 6 karakter");
      return;
    }
    if (!email.includes("@")) {
      setError("Format email tidak valid");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/auth/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          username: username.trim(),
          name: name.trim(),
          role,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setSaving(false);
        setError(result.error || "Gagal membuat user");
        return;
      }

      setSaving(false);
      onSuccess();
    } catch (err: any) {
      setSaving(false);
      setError(err.message || "Terjadi kesalahan");
    }
  };

  return (
    <div className="mb-6 p-5 bg-cream-50 border border-brand-200 rounded-xl">
      <h4 className="text-sm font-semibold text-brand-800 mb-4">Tambah User Baru</h4>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-brand-600 mb-1">Nama</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama lengkap"
              className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm text-brand-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-600 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm text-brand-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@contoh.com"
              className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm text-brand-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-600 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full px-3 py-2 pr-10 border border-brand-200 rounded-lg text-sm text-brand-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-300 hover:text-brand-500"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-brand-600 mb-1">Role</label>
          <div className="flex gap-2">
            {([
              { value: "warehouse" as UserRole, label: "Warehouse", icon: Warehouse },
              { value: "admin" as UserRole, label: "Admin", icon: Shield },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                  role === opt.value
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white text-brand-500 border-brand-200 hover:bg-cream-100"
                )}
              >
                <opt.icon className="w-4 h-4" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {saving ? <Spinner /> : <Plus className="w-4 h-4" />}
            Buat User
          </button>
        </div>
      </form>
    </div>
  );
}
