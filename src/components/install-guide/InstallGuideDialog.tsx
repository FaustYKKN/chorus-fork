"use client";

// A re-openable dialog wrapping the full multi-agent install guide. The original
// guide surfaces are one-shot — it renders once at agent-creation (AgentCreateForm)
// and inside the onboarding wizard — so a user who dismissed that screen had no way
// back to the opencode setup steps. This dialog can be opened any time from the
// agent-presence surfaces (the pill popover / "View all" connections modal), and
// the daemon-connect empty states route here instead of printing a bare (and, for
// opencode, wrong) one-line command.
//
// No API key is available on these surfaces — the raw key is shown only once at
// creation and stored hashed — so the guide renders with its <YOUR_API_KEY>
// placeholder, which the user fills in from their own records.

import type { ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AgentInstallGuide } from "./AgentInstallGuide";

type InstallGuideDialogProps = {
  apiKey?: string | null;
  triggerVariant?: ComponentProps<typeof Button>["variant"];
  triggerClassName?: string;
};

export function InstallGuideDialog({
  apiKey = null,
  triggerVariant = "outline",
  triggerClassName,
}: InstallGuideDialogProps) {
  const t = useTranslations("daemonConnectCta");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm" className={triggerClassName}>
          <BookOpen className="mr-1.5 h-4 w-4" aria-hidden />
          {t("openGuide")}
        </Button>
      </DialogTrigger>
      {/* flex column (not the default grid) + sm:max-w-3xl to actually widen past
          the base sm:max-w-lg; the guide scrolls inside `min-w-0 overflow-auto`
          so the long setup one-liners scroll within the dialog instead of blowing
          its width out and pushing the tabs/code off-screen. */}
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("guideDialogTitle")}</DialogTitle>
          <DialogDescription>{t("bodyLong")}</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 flex-1 overflow-auto">
          <AgentInstallGuide apiKey={apiKey} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
