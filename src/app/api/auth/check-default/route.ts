// src/app/api/auth/check-default/route.ts
// Check if default auth is enabled

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success } from "@/lib/api-response";
import { isDefaultAuthEnabled, getDefaultUserEmail } from "@/lib/default-auth";
import { isSuperAdminEmail } from "@/lib/super-admin";
import { hasLocalUsers } from "@/services/user.service";
import { isRegistrationOpen } from "@/services/company.service";

export const GET = withErrorHandler(async (_request: NextRequest) => {
  // The password form is shown when the env default-auth pair is configured
  // OR any DB-backed local account exists (fork feature).
  const envEnabled = isDefaultAuthEnabled();
  const enabled = envEnabled || (await hasLocalUsers());

  // True iff default auth is enabled AND the default user email is also the
  // Super Admin email (case-insensitive, handled by isSuperAdminEmail). The
  // email itself is never echoed back to the client.
  const defaultEmail = getDefaultUserEmail();
  const superAdminCollision =
    envEnabled && defaultEmail != null && isSuperAdminEmail(defaultEmail);

  // Self-registration is open iff some Company has an invite code set.
  const registrationEnabled = await isRegistrationOpen();

  return success({ enabled, superAdminCollision, registrationEnabled });
});
