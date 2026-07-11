import "server-only";

export function isAdminRequest(request: Request) {
  const configuredToken = process.env.ADMIN_TOKEN;

  if (!configuredToken && process.env.NODE_ENV !== "production") {
    return true;
  }

  if (!configuredToken) {
    return false;
  }

  return request.headers.get("x-admin-token") === configuredToken;
}
