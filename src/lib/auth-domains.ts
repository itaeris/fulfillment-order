export const GOOGLE_ALLOWED_DOMAINS = ["aerisbeaute.com", "fromthisisland.com"] as const;

export function isGoogleUser(user: {
  app_metadata?: { provider?: string };
  identities?: { provider: string }[] | null;
}): boolean {
  if (user.app_metadata?.provider === "google") return true;
  return user.identities?.some((identity) => identity.provider === "google") ?? false;
}

export function googleEmailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() || "";
}

export function isAllowedGoogleEmail(email: string): boolean {
  const domain = googleEmailDomain(email);
  return (GOOGLE_ALLOWED_DOMAINS as readonly string[]).includes(domain);
}
