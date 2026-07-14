// src/types/admin.ts
// Super Admin related type definitions

// Company list item
export interface CompanyListItem {
  uuid: string;
  name: string;
  emailDomains: string[];
  oidcEnabled: boolean;
  userCount: number;
  agentCount: number;
  createdAt: string;
}

// Company detail
export interface CompanyDetail extends CompanyListItem {
  oidcIssuer: string | null;
  oidcClientId: string | null;
  registerCode: string | null;
  updatedAt: string;
}

// Company creation input
export interface CompanyCreateInput {
  name: string;
  emailDomains?: string[];
  oidcIssuer?: string;
  oidcClientId?: string;
}

// Company update input
export interface CompanyUpdateInput {
  name?: string;
  emailDomains?: string[];
  oidcIssuer?: string | null;
  oidcClientId?: string | null;
  oidcEnabled?: boolean;
  // Self-registration invite code (fork feature); null closes registration.
  registerCode?: string | null;
}

// Admin user list item (fork feature: local account management)
export interface AdminUserListItem {
  uuid: string;
  email: string | null;
  name: string | null;
  disabled: boolean;
  // Whether this user has a local password set (can use the password form).
  hasPassword: boolean;
  createdAt: string;
  company: {
    uuid: string;
    name: string;
  };
}

// Admin create-user input (always creates a local password account)
export interface AdminUserCreateInput {
  companyUuid: string;
  email: string;
  password: string;
  name?: string;
}

// Admin update-user input — any subset: reset password, toggle disabled, rename
export interface AdminUserUpdateInput {
  password?: string;
  disabled?: boolean;
  name?: string;
}

// Candidate workspace entry for oidc_multi_match responses.
// oidcIssuerHost is the parsed hostname of the Company's oidcIssuer URL
// (falls back to the raw string when URL parsing fails).
export interface IdentifyCandidate {
  uuid: string;
  name: string;
  oidcIssuerHost: string;
}

// A single resolvable login path for an email, used in multi_role responses.
// super_admin / default_auth entries carry no company (no secret material);
// oidc entries carry the full company payload needed to start the OIDC flow.
export interface IdentifyRoleOption {
  kind: "super_admin" | "default_auth" | "oidc";
  company?: {
    uuid: string;
    name: string;
    oidcIssuer: string;
    oidcClientId: string;
  };
}

// Email identification response
export interface IdentifyResponse {
  type:
    | "super_admin"
    | "oidc"
    | "oidc_multi_match"
    | "default_auth"
    | "multi_role"
    | "not_found";
  company?: {
    uuid: string;
    name: string;
    oidcIssuer: string;
    oidcClientId: string;
  };
  candidates?: IdentifyCandidate[];
  roles?: IdentifyRoleOption[];
  message?: string;
}
