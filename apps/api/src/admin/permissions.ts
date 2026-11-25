/** Admin permission codes. Roles are seeded in prisma/seed.ts; '*' grants everything. */
export const P = {
  DASHBOARD: 'dashboard.view',
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  PROVIDERS_VIEW: 'providers.view',
  PROVIDERS_MANAGE: 'providers.manage',
  PROVIDERS_VERIFY: 'providers.verify',
  LISTINGS_VIEW: 'listings.view',
  LISTINGS_MODERATE: 'listings.moderate',
  CATEGORIES_MANAGE: 'categories.manage',
  ORGS_VIEW: 'organizations.view',
  ORGS_MANAGE: 'organizations.manage',
  REPORTS_VIEW: 'reports.view',
  REPORTS_RESOLVE: 'reports.resolve',
  MONETIZATION: 'monetization.manage',
  AUDIT_VIEW: 'audit.view',
  ADMINS_MANAGE: 'admins.manage',
} as const;

export const ALL_PERMISSIONS = Object.values(P);

export const ROLE_DEFINITIONS: Record<string, { name: string; description: string; permissions: string[] }> = {
  SUPER_ADMIN: { name: 'Super admin', description: 'Full access, including managing other admins', permissions: ['*'] },
  MODERATOR: {
    name: 'Moderator',
    description: 'Reviews reports, moderates listings, reviews and providers',
    permissions: [
      P.DASHBOARD,
      P.USERS_VIEW,
      P.PROVIDERS_VIEW,
      P.PROVIDERS_MANAGE,
      P.PROVIDERS_VERIFY,
      P.LISTINGS_VIEW,
      P.LISTINGS_MODERATE,
      P.ORGS_VIEW,
      P.ORGS_MANAGE,
      P.REPORTS_VIEW,
      P.REPORTS_RESOLVE,
    ],
  },
  SUPPORT: {
    name: 'Support',
    description: 'Read access to help users; can suspend and reactivate accounts',
    permissions: [P.DASHBOARD, P.USERS_VIEW, P.USERS_MANAGE, P.PROVIDERS_VIEW, P.LISTINGS_VIEW, P.ORGS_VIEW, P.REPORTS_VIEW],
  },
  CATALOG_MANAGER: {
    name: 'Catalog manager',
    description: 'Manages categories, featured placements and plans',
    permissions: [P.DASHBOARD, P.LISTINGS_VIEW, P.CATEGORIES_MANAGE, P.MONETIZATION],
  },
};
