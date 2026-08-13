"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { CodeBlock } from "./CodeBlock";

interface AgentInstallGuideProps {
  apiKey: string | null;
}

// Offline plugin tarball served from public/ — bump alongside plugin releases.
const OPENCODE_PLUGIN_TGZ = "opencode-chorus-0.10.10.tgz";

export function AgentInstallGuide({ apiKey }: AgentInstallGuideProps) {
  const t = useTranslations("onboarding");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const displayKey = apiKey || "<YOUR_API_KEY>";
  const opencodePluginUrl = `${origin}/${OPENCODE_PLUGIN_TGZ}`;

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <Tabs defaultValue="opencode" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="opencode" className="flex-1">
              {t("install.tabs.opencode")}
            </TabsTrigger>
            <TabsTrigger value="claude-code" className="flex-1">
              {t("install.tabs.claudeCode")}
            </TabsTrigger>
            <TabsTrigger value="codex" className="flex-1">
              {t("install.tabs.codex")}
            </TabsTrigger>
            <TabsTrigger value="openclaw" className="flex-1">
              {t("install.tabs.openClaw")}
            </TabsTrigger>
            <TabsTrigger value="other" className="flex-1">
              {t("install.tabs.other")}
            </TabsTrigger>
          </TabsList>

          {/* OpenCode Tab */}
          <TabsContent value="opencode" className="mt-4 space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {t("install.opencode.step1Title")}
              </h3>
              <p className="mb-1 text-xs text-muted-foreground">
                {t("install.opencode.step1WindowsLabel")}
              </p>
              <CodeBlock
                language="powershell"
                code={`$env:CHORUS_URL = "${origin}"; setx CHORUS_URL "${origin}"\n$env:CHORUS_API_KEY = "${displayKey}"; setx CHORUS_API_KEY "${displayKey}"`}
              />
              <p className="mb-1 mt-3 text-xs text-muted-foreground">
                {t("install.opencode.step1UnixLabel")}
              </p>
              <CodeBlock
                language="bash"
                code={`export CHORUS_URL="${origin}"\nexport CHORUS_API_KEY="${displayKey}"`}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {t("install.opencode.step1Tip")}
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {t("install.opencode.step2Title")}
              </h3>
              <CodeBlock language="bash" code="npm install -g opencode-ai" />
              <p className="mt-2 text-xs text-muted-foreground">
                {t("install.opencode.step2Tip")}
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {t("install.opencode.step3Title")}
              </h3>
              <p className="mb-1 text-xs text-muted-foreground">
                {t("install.opencode.step3WindowsLabel")}
              </p>
              <CodeBlock
                language="powershell"
                code={`Invoke-WebRequest -UseBasicParsing ${origin}/ripgrep-win64.zip -OutFile "$env:TEMP\\rg.zip"; Expand-Archive "$env:TEMP\\rg.zip" "$env:TEMP\\rgx" -Force; New-Item -ItemType Directory -Force "$env:USERPROFILE\\.cache\\opencode\\bin" | Out-Null; Copy-Item "$env:TEMP\\rgx\\ripgrep-15.1.0-x86_64-pc-windows-msvc\\rg.exe" "$env:USERPROFILE\\.cache\\opencode\\bin\\rg.exe" -Force; $dir = "$env:USERPROFILE\\.cache\\opencode\\bin"; $userPath = [Environment]::GetEnvironmentVariable("Path", "User"); if ($userPath -notlike "*$dir*") { [Environment]::SetEnvironmentVariable("Path", "$userPath;$dir", "User") }; & "$dir\\rg.exe" --version`}
              />
              <p className="mb-1 mt-3 text-xs text-muted-foreground">
                {t("install.opencode.step3UnixLabel")}
              </p>
              <CodeBlock
                language="bash"
                code={`mkdir -p ~/.cache/opencode/bin && curl -sL ${origin}/ripgrep-linux-x64.tar.gz | tar -xz --strip-components=1 -C ~/.cache/opencode/bin --wildcards "*/rg" && ~/.cache/opencode/bin/rg --version`}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {t("install.opencode.step3Tip")}
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {t("install.opencode.step4Title")}
              </h3>
              <CodeBlock
                language="bash"
                code={`npx -y ${opencodePluginUrl} setup`}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {t("install.opencode.step4Tip")}
              </p>
            </div>

            {/* Troubleshooting collapsible */}
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="size-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                {t("install.opencode.troubleshootingTitle")}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-2">
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      {t("install.opencode.issueCache.title")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("install.opencode.issueCache.fix")}
                    </p>
                  </div>
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      {t("install.opencode.issueEnv.title")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("install.opencode.issueEnv.fix")}
                    </p>
                  </div>
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      {t("install.opencode.issueCheckin.title")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("install.opencode.issueCheckin.fix")}
                    </p>
                  </div>
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      {t("install.opencode.issueWrongAgent.title")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("install.opencode.issueWrongAgent.fix")}
                    </p>
                  </div>
                  </div>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          {/* Claude Code Tab */}
          <TabsContent value="claude-code" className="mt-4 space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {t("install.claudeCode.step1Title")}
              </h3>
              <CodeBlock
                language="bash"
                code={`export CHORUS_URL="${origin}"\nexport CHORUS_API_KEY="${displayKey}"`}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {t("install.claudeCode.step1Tip")}
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {t("install.claudeCode.step2Title")}
              </h3>
              <CodeBlock
                language="bash"
                code={`/plugin marketplace add Chorus-AIDLC/chorus\n/plugin install chorus@chorus-plugins`}
              />
            </div>
          </TabsContent>

          {/* Codex Tab */}
          <TabsContent value="codex" className="mt-4 space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {t("install.codex.step1Title")}
              </h3>
              <CodeBlock
                language="bash"
                code={`export CHORUS_URL="${origin}"\nexport CHORUS_API_KEY="${displayKey}"`}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {t("install.codex.step1Tip")}
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {t("install.codex.step2Title")}
              </h3>
              <CodeBlock
                language="bash"
                code={`curl -fsSL ${origin}/install-codex.sh | bash`}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {t("install.codex.step2Tip")}
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {t("install.codex.step3Title")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("install.codex.step3Desc")}
              </p>
            </div>
          </TabsContent>

          {/* OpenClaw Tab */}
          <TabsContent value="openclaw" className="mt-4 space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {t("install.openClaw.step1Title")}
              </h3>
              <CodeBlock
                language="bash"
                code="openclaw plugins install @chorus-aidlc/chorus-openclaw-plugin"
              />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {t("install.openClaw.step2Title")}
              </h3>
              <CodeBlock
                language="json"
                code={`{
  "hooks": { "enabled": true, "token": "<your-token>" },
  "plugins": {
    "enabled": true,
    "entries": {
      "chorus-openclaw-plugin": {
        "enabled": true,
        "config": {
          "chorusUrl": "${origin}",
          "apiKey": "${displayKey}",
          "autoStart": true
        }
      }
    }
  }
}`}
              />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {t("install.openClaw.step3Title")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("install.openClaw.step3Desc")}
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {t("install.openClaw.step4Title")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("install.openClaw.step4Desc")}
              </p>
              <CodeBlock code="/chorus status" />
            </div>

            {/* Troubleshooting collapsible */}
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="size-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                {t("install.openClaw.troubleshootingTitle")}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    {t("install.openClaw.troubleshootingError")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("install.openClaw.troubleshootingFix")}
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          {/* Other Agents Tab */}
          <TabsContent value="other" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("install.other.description")}
            </p>
            <CodeBlock
              code={`Please install and configure the Chorus AI-DLC collaboration platform.

Chorus URL: ${origin}
API Key: ${displayKey}

Read the setup instructions from:
${origin}/skill/chorus/SKILL.md

Follow the "Setup" section to configure the MCP server,
then call chorus_checkin() to verify the connection.`}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
