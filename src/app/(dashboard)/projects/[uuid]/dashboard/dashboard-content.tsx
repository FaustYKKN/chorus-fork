// Shared Server Component for /dashboard and /dashboard/[ideaUuid]

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { getDashboardData } from "./dashboard-data";
import { ProjectSettingsModal } from "./project-settings-modal";
import { IdeaTracker } from "./idea-tracker";
import { CollapsibleMarkdown } from "@/components/collapsible-markdown";
import { Badge } from "@/components/ui/badge";

interface DashboardContentProps {
  projectUuid: string;
  initialSelectedIdeaUuid?: string;
}

export async function DashboardContent({ projectUuid, initialSelectedIdeaUuid }: DashboardContentProps) {
  const t = await getTranslations();
  const { project, trackerData, stats, attention, activities, currentUserUuid } = await getDashboardData(projectUuid);
  const na = attention.needsAttention;

  return (
    <div className="flex h-full flex-col gap-5 p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#A8A39B]">{t("ideaTracker.overview")}</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-[#2C2C2A]">{project.name}</h1>
          {project.description?.trim() ? (
            <CollapsibleMarkdown
              content={project.description}
              className="mt-1 text-[13px] leading-relaxed text-[#5F5E5A] max-w-none"
            />
          ) : (
            <p className="mt-1 text-[13px] text-[#5F5E5A]">{t("ideaTracker.overviewSubtitle")}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ProjectSettingsModal projectUuid={projectUuid} projectName={project.name} projectDescription={project.description ?? null} />
        </div>
      </div>
      {/* R6 — unattended-batch "morning summary": in-progress / to-verify / needs-attention. */}
      {(attention.inProgress > 0 || attention.toVerify > 0 || na.total > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#E7E3DC] bg-white px-4 py-2.5 text-[13px]" data-testid="batch-summary">
          <span className="font-medium text-[#5F5E5A]">{t("batchSummary.title")}</span>
          <Badge variant="secondary">{t("batchSummary.inProgress", { n: attention.inProgress })}</Badge>
          <Badge variant="secondary">{t("batchSummary.toVerify", { n: attention.toVerify })}</Badge>
          {na.crashed > 0 && <Badge variant="destructive">{t("batchSummary.crashed", { n: na.crashed })}</Badge>}
          {na.timedOut > 0 && <Badge variant="destructive">{t("batchSummary.timedOut", { n: na.timedOut })}</Badge>}
          {na.unsubmitted > 0 && <Badge variant="warning">{t("batchSummary.unsubmitted", { n: na.unsubmitted })}</Badge>}
          {na.total === 0 && <span className="text-[#8A8680]">{t("batchSummary.allClear")}</span>}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {/* IdeaTracker reads useSearchParams() (via usePanelUrl) so the idea
            side-panel selection tracks the URL on soft navigation. Next 15
            requires a Suspense boundary above any useSearchParams() consumer,
            else the whole route opts into client-side rendering (+ build
            warning). The fallback fills the same flex cell so the static header
            above streams with no layout jump. */}
        <Suspense fallback={<div className="h-full" />}>
          <IdeaTracker
            projectUuid={projectUuid}
            projectName={project.name}
            currentUserUuid={currentUserUuid}
            initialTrackerData={trackerData}
            initialStatsData={{ stats, recentActivities: activities }}
            initialSelectedIdeaUuid={initialSelectedIdeaUuid}
          />
        </Suspense>
      </div>
    </div>
  );
}
