"use client";

// Team member management (P3). Owners add/remove company users; members can
// leave; the owner cannot leave or be removed (enforced server-side too). Backs
// onto /api/project-groups/[uuid]/members, /leave, and /api/mentionables (the
// company-user picker). See docs/specs/team-scoping.md.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Crown, UserPlus, X } from "lucide-react";
import { authFetch } from "@/lib/auth-client";
import { useAuth } from "@/contexts/auth-context";

interface Member {
  userUuid: string;
  role: "owner" | "member";
  name: string | null;
  email: string | null;
}

interface Candidate {
  type: "user" | "agent";
  uuid: string;
  name: string;
  email?: string | null;
}

interface TeamMembersDialogProps {
  groupUuid: string;
  groupName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TeamMembersDialog({
  groupUuid,
  groupName,
  open,
  onOpenChange,
}: TeamMembersDialogProps) {
  const t = useTranslations("teamMembers");
  const { user } = useAuth();
  const myUuid = user?.uuid;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const iAmOwner = members.some((m) => m.userUuid === myUuid && m.role === "owner");
  const iAmMember = members.some((m) => m.userUuid === myUuid);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/project-groups/${groupUuid}/members`);
      const data = await res.json();
      if (data.success) setMembers(data.data.members);
      else setError(data.error || t("loadError"));
    } catch {
      setError(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [groupUuid, t]);

  useEffect(() => {
    if (open) load();
    else {
      setQuery("");
      setCandidates([]);
      setError(null);
    }
  }, [open, load]);

  // Company-user picker (owner only): debounced search, excluding current members.
  useEffect(() => {
    if (!open || !iAmOwner) return;
    const handle = setTimeout(async () => {
      try {
        const res = await authFetch(
          `/api/mentionables?q=${encodeURIComponent(query)}&limit=10`
        );
        const data = await res.json();
        const taken = new Set(members.map((m) => m.userUuid));
        const list: Candidate[] = data.success ? data.data : [];
        setCandidates(list.filter((c) => c.type === "user" && !taken.has(c.uuid)));
      } catch {
        setCandidates([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open, iAmOwner, members]);

  const addMember = async (userUuid: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/project-groups/${groupUuid}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userUuid }),
      });
      const data = await res.json();
      if (data.success) {
        setQuery("");
        await load();
      } else setError(data.error || t("addError"));
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userUuid: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(
        `/api/project-groups/${groupUuid}/members/${userUuid}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) await load();
      else setError(data.error || t("removeError"));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/project-groups/${groupUuid}/leave`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        onOpenChange(false);
        window.location.reload();
      } else setError(data.error || t("leaveError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title", { team: groupName })}</DialogTitle>
          <DialogDescription>
            {iAmOwner ? t("ownerHint") : t("memberHint")}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            members.map((m) => (
              <div
                key={m.userUuid}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {m.role === "owner" && (
                      <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    <span className="truncate">
                      {m.name || m.email || m.userUuid.slice(0, 8)}
                    </span>
                    {m.userUuid === myUuid && (
                      <span className="text-xs text-muted-foreground">
                        ({t("you")})
                      </span>
                    )}
                  </div>
                  {m.email && (
                    <div className="truncate text-xs text-muted-foreground">
                      {m.email}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant={m.role === "owner" ? "default" : "secondary"}
                    className="text-[11px]"
                  >
                    {t(m.role)}
                  </Badge>
                  {iAmOwner && m.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => removeMember(m.userUuid)}
                      aria-label={t("remove")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {iAmOwner && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserPlus className="h-4 w-4" />
              {t("addTitle")}
            </div>
            <Input
              placeholder={t("searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {candidates.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {candidates.map((c) => (
                  <button
                    key={c.uuid}
                    type="button"
                    disabled={busy}
                    onClick={() => addMember(c.uuid)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <span className="truncate">
                      {c.name || c.uuid.slice(0, 8)}
                      {c.email && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c.email}
                        </span>
                      )}
                    </span>
                    <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {iAmMember && !iAmOwner && (
          <div className="border-t pt-3">
            <Button variant="outline" disabled={busy} onClick={leave}>
              {t("leave")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
