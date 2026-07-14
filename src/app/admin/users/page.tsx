"use client";

// Super admin user management (fork feature).
// Lists every human user across companies; creates local password accounts;
// resets passwords; enables/disables accounts.

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, KeyRound, Ban, CircleCheck, RefreshCw, Copy } from "lucide-react";
import { formatDateTime } from "@/lib/format-date";
import type { AdminUserListItem } from "@/types/admin";

interface CompanyOption {
  uuid: string;
  name: string;
}

const ALL_COMPANIES = "__all__";

// Random password: 12 chars, unambiguous alphanumerics.
function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export default function AdminUsersPage() {
  const t = useTranslations();
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>(ALL_COMPANIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createCompany, setCreateCompany] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Reset-password dialog state
  const [resetTarget, setResetTarget] = useState<AdminUserListItem | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetDone, setResetDone] = useState(false);

  const fetchUsers = useCallback(async (companyUuid: string) => {
    setLoading(true);
    setError("");
    try {
      const filter =
        companyUuid !== ALL_COMPANIES
          ? `&companyUuid=${encodeURIComponent(companyUuid)}`
          : "";
      const response = await fetch(`/api/admin/users?pageSize=100${filter}`);
      const data = await response.json();
      if (data.success) {
        setUsers(data.data);
      } else {
        setError(data.error?.message || t("admin.usersLoadFailed"));
      }
    } catch {
      setError(t("admin.networkError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    async function fetchCompanies() {
      try {
        const response = await fetch("/api/admin/companies?pageSize=100");
        const data = await response.json();
        if (data.success) {
          setCompanies(
            data.data.map((c: { uuid: string; name: string }) => ({
              uuid: c.uuid,
              name: c.name,
            }))
          );
        }
      } catch {
        // Company filter stays empty; the user list still works.
      }
    }
    fetchCompanies();
  }, []);

  useEffect(() => {
    fetchUsers(companyFilter);
  }, [companyFilter, fetchUsers]);

  const openCreate = () => {
    setCreateCompany(companies[0]?.uuid || "");
    setCreateEmail("");
    setCreateName("");
    setCreatePassword(generatePassword());
    setCreateError("");
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyUuid: createCompany,
          email: createEmail.trim(),
          name: createName.trim() || undefined,
          password: createPassword,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        if (data.error?.details?.email) {
          setCreateError(t("admin.userEmailTaken"));
        } else {
          setCreateError(data.error?.message || t("admin.userCreateFailed"));
        }
        return;
      }
      setNotice(
        t("admin.userCreated", {
          email: createEmail.trim(),
          password: createPassword,
        })
      );
      setCreateOpen(false);
      fetchUsers(companyFilter);
    } catch {
      setCreateError(t("admin.networkError"));
    } finally {
      setCreating(false);
    }
  };

  const openReset = (user: AdminUserListItem) => {
    setResetTarget(user);
    setResetPassword(generatePassword());
    setResetError("");
    setResetDone(false);
  };

  const handleReset = async () => {
    if (!resetTarget) return;
    setResetError("");
    setResetting(true);
    try {
      const response = await fetch(`/api/admin/users/${resetTarget.uuid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      });
      const data = await response.json();
      if (!data.success) {
        setResetError(data.error?.message || t("admin.userUpdateFailed"));
        return;
      }
      setResetDone(true);
      fetchUsers(companyFilter);
    } catch {
      setResetError(t("admin.networkError"));
    } finally {
      setResetting(false);
    }
  };

  const handleToggleDisabled = async (user: AdminUserListItem) => {
    if (
      !user.disabled &&
      !confirm(t("admin.disableUserConfirm", { email: user.email || user.uuid }))
    ) {
      return;
    }
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${user.uuid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !user.disabled }),
      });
      const data = await response.json();
      if (!data.success) {
        setError(data.error?.message || t("admin.userUpdateFailed"));
        return;
      }
      fetchUsers(companyFilter);
    } catch {
      setError(t("admin.networkError"));
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The global execCommand fallback handles insecure contexts; a failure
      // here just means the admin copies it by hand.
    }
  };

  return (
    <div className="min-h-full bg-background px-8 py-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {t("admin.usersTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("admin.usersDesc")}
          </p>
        </div>
        <Button onClick={openCreate}>
          <UserPlus className="mr-2 h-4 w-4" />
          {t("admin.createUser")}
        </Button>
      </div>

      {/* Filter */}
      <div className="mb-4 flex items-center gap-3">
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_COMPANIES}>
              {t("admin.allCompanies")}
            </SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.uuid} value={c.uuid}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fetchUsers(companyFilter)}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <span className="break-all">{notice}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNotice("")}
          >
            {t("common.close")}
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              {t("common.loading")}
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {t("admin.noUsers")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.email")}</TableHead>
                  <TableHead>{t("admin.userName")}</TableHead>
                  <TableHead>{t("admin.userCompany")}</TableHead>
                  <TableHead>{t("admin.userType")}</TableHead>
                  <TableHead>{t("admin.userStatus")}</TableHead>
                  <TableHead>{t("admin.userCreatedAt")}</TableHead>
                  <TableHead className="text-right">
                    {t("admin.tableActions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.uuid}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.company.name}</TableCell>
                    <TableCell>
                      {user.hasPassword ? (
                        <Badge variant="secondary">
                          {t("admin.localAccount")}
                        </Badge>
                      ) : (
                        <Badge variant="outline">{t("admin.oidcAccount")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.disabled ? (
                        <Badge variant="destructive">
                          {t("admin.userDisabled")}
                        </Badge>
                      ) : (
                        <Badge variant="success">{t("admin.userActive")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(user.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openReset(user)}
                        >
                          <KeyRound className="mr-1 h-3.5 w-3.5" />
                          {t("admin.resetPassword")}
                        </Button>
                        <Button
                          variant={user.disabled ? "outline" : "ghost"}
                          size="sm"
                          onClick={() => handleToggleDisabled(user)}
                        >
                          {user.disabled ? (
                            <>
                              <CircleCheck className="mr-1 h-3.5 w-3.5" />
                              {t("admin.enableUser")}
                            </>
                          ) : (
                            <>
                              <Ban className="mr-1 h-3.5 w-3.5" />
                              {t("admin.disableUser")}
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.createUser")}</DialogTitle>
            <DialogDescription>{t("admin.createUserDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("admin.userCompany")}</Label>
              <Select value={createCompany} onValueChange={setCreateCompany}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.uuid} value={c.uuid}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">{t("admin.email")}</Label>
              <Input
                id="create-email"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                required
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-name">{t("admin.userName")}</Label>
              <Input
                id="create-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">{t("admin.password")}</Label>
              <div className="flex gap-2">
                <Input
                  id="create-password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  required
                  disabled={creating}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreatePassword(generatePassword())}
                  disabled={creating}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("admin.userPasswordHelp")}
              </p>
            </div>
            {createError && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {createError}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={creating || !createCompany}>
                {creating ? t("common.saving") : t("admin.createUserSubmit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.resetPassword")}</DialogTitle>
            <DialogDescription>
              {t("admin.resetPasswordFor", {
                email: resetTarget?.email || "",
              })}
            </DialogDescription>
          </DialogHeader>
          {resetDone ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
                {t("admin.resetPasswordDone")}
              </div>
              <div className="flex items-center gap-2">
                <Input value={resetPassword} readOnly className="font-mono" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copyText(resetPassword)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setResetTarget(null)}>
                  {t("common.close")}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-password">{t("admin.newPassword")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="reset-password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="font-mono"
                    disabled={resetting}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setResetPassword(generatePassword())}
                    disabled={resetting}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.userPasswordHelp")}
                </p>
              </div>
              {resetError && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {resetError}
                </div>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResetTarget(null)}
                  disabled={resetting}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={handleReset}
                  disabled={resetting || resetPassword.length < 8}
                >
                  {resetting ? t("common.saving") : t("admin.resetPasswordSubmit")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
