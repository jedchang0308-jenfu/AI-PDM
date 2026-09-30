/** Bind an in-process command to the exact mounted route and HTTP method. */
export function principalCommandRouteMatches(request: Request, routePath: string, method: string): boolean {
  if (request.method !== method || !routePath.startsWith("src/app/api/") ||
      !routePath.endsWith("/route.ts")) return false;
  let actual: string;
  try { actual = new URL(request.url).pathname; }
  catch { return false; }
  const template = routePath.slice("src/app".length, -"/route.ts".length).split("/");
  const segments = actual.split("/");
  return template.length === segments.length && template.every((segment, index) =>
    /^\[[^\]]+\]$/u.test(segment) ? segments[index].length > 0 : segment === segments[index]);
}
