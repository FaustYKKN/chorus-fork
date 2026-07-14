"use client";

// Self-registration page for local password accounts (fork feature).
// Requires a team invite code (Company.registerCode) handed out by the admin;
// the code decides which company the account joins.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

interface RegisterErrorPayload {
  code?: string;
  message?: string;
  details?: { inviteCode?: string; email?: string; password?: string };
}

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations();
  const [inviteCode, setInviteCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // null = still probing; false = no company accepts registration.
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAvailability() {
      try {
        const response = await fetch("/api/auth/check-default");
        const data = await response.json();
        setRegistrationOpen(Boolean(data.success && data.data?.registrationEnabled));
      } catch {
        setRegistrationOpen(false);
      }
    }
    checkAvailability();
  }, []);

  const mapServerError = (err: RegisterErrorPayload | undefined): string => {
    if (err?.code === "UNAUTHORIZED") return t("register.invalidCode");
    if (err?.details?.email) return t("register.emailTaken");
    if (err?.details?.password) return t("register.passwordTooShort", { min: MIN_PASSWORD_LENGTH });
    if (err?.details?.inviteCode) return t("register.invalidCode");
    return err?.message || t("common.genericError");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("register.passwordTooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("register.passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: inviteCode.trim(),
          email: email.trim(),
          password,
          name: name.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(mapServerError(data.error));
        return;
      }

      // The account is already logged in (session cookie set by the route).
      router.push(data.data?.redirectTo || "/onboarding");
    } catch {
      setError(t("login.networkError"));
    } finally {
      setLoading(false);
    }
  };

  if (registrationOpen === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-[400px]">
        <CardContent className="p-10">
          {/* Logo Section */}
          <div className="mb-8 flex flex-col items-center gap-2">
            <img src="/chorus-icon.png" alt="Chorus" className="h-12 w-12" />
            <h1 className="text-[28px] font-semibold text-foreground">
              {t("register.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("register.subtitle")}
            </p>
          </div>

          {!registrationOpen ? (
            <>
              <div className="rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
                {t("register.closed")}
              </div>
              <div className="mt-6 flex justify-center">
                <Link href="/login">
                  <Button variant="link" size="sm">
                    {t("register.backToLogin")}
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inviteCode">{t("register.inviteCode")}</Label>
                  <Input
                    id="inviteCode"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder={t("register.inviteCodePlaceholder")}
                    required
                    disabled={loading}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("register.inviteCodeHelp")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">{t("register.name")}</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("register.namePlaceholder")}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t("register.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">{t("register.password")}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    >
                      {showPassword ? (
                        <Eye className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <EyeOff className="h-5 w-5 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("register.passwordHelp", { min: MIN_PASSWORD_LENGTH })}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">
                    {t("register.confirmPassword")}
                  </Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? t("register.submitting") : t("register.submit")}
                </Button>
              </form>

              <div className="mt-6 flex justify-center">
                <Link href="/login">
                  <Button variant="link" size="sm">
                    {t("register.backToLogin")}
                  </Button>
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
