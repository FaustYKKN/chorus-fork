"use client";

// Shared "connect a daemon" call-to-action for the daemon-discoverability empty
// states. Rendered wherever "you have no online agent connection right now":
//   - the sidebar agent-presence pill popover (compact variant),
//   - the onboarding completion screen (prominent),
//   - the Agent Connections "View all" modal empty state (prominent),
//   - the conversational-entry offline fallback (compact).
//
// The action is a single button that opens the full multi-agent install guide
// (InstallGuideDialog). It deliberately does NOT print a lone `npx ... daemon`
// command: our fleet is opencode-first, whose connect flow is multi-step (env +
// opencode-ai + ripgrep + plugin `setup`), so a one-liner would be wrong and
// misleading. The guide is the single source of truth for how to connect — the
// component here is purely presentational and fetches nothing.

import { useTranslations } from "next-intl";
import { Terminal } from "lucide-react";
import { InstallGuideDialog } from "@/components/install-guide/InstallGuideDialog";

export type DaemonConnectCtaVariant = "compact" | "prominent";

export function DaemonConnectCta({ variant }: { variant: DaemonConnectCtaVariant }) {
  const t = useTranslations("daemonConnectCta");

  if (variant === "compact") {
    // Narrow surface (sidebar pill popover ~360px): tight spacing, a one-line
    // explanation, and the open-guide action.
    return (
      <div className="flex flex-col gap-2.5 px-1 py-1.5">
        <div className="flex items-start gap-2">
          <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-[#C67A52]" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-[#6B6B6B]">
            {t("body")}
          </p>
        </div>
        <InstallGuideDialog triggerClassName="self-start" />
      </div>
    );
  }

  // Prominent surface (onboarding completion screen, also fine in the wider Agent
  // Connections modal): a framed "next step" card with headline, the "installed
  // plugin ≠ resident online" body, and the open-guide action.
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-[#EFEBE4] bg-[#FCFBF8] p-5 text-left">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-[#C67A52]" aria-hidden />
        <h3 className="text-[14px] font-semibold text-[#2C2C2C]">
          {t("headline")}
        </h3>
      </div>
      <p className="text-[13px] leading-relaxed text-[#6B6B6B]">{t("bodyLong")}</p>
      <InstallGuideDialog triggerVariant="default" triggerClassName="self-start" />
    </div>
  );
}
