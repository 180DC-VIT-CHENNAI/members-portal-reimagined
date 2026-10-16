const ASSET_EXTENSIONS = new Set([
  ".js", ".mjs", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg",
  ".ico", ".webp", ".avif", ".woff", ".woff2", ".ttf", ".eot",
]);

function isAssetPath(path: string): boolean {
  if (!path.startsWith("/assets/") && !path.startsWith("/images/") && !path.startsWith("/leads/") && !path.startsWith("/favicon")) return false;
  const dot = path.lastIndexOf(".");
  if (dot === -1) return false;
  return ASSET_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

function addSecurityHeaders(headers: Headers, apiOrigin = API_BASE) {
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://180dc.org https://cdn.180dcvitc.org https://static.cloudflareinsights.com; connect-src 'self' ${apiOrigin} ${apiOrigin.replace(/^http/, "ws")} https://cloudflareinsights.com https://raw.githubusercontent.com https://gist.githubusercontent.com; font-src 'self' https://fonts.gstatic.com; frame-src 'self'; worker-src 'self' blob: https://cdn.jsdelivr.net; frame-ancestors 'none'; base-uri 'self'`,
  );
  headers.set("X-XSS-Protection", "0");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
}

// workers.dev host for admin-api is currently broken (error 1042); override
// via the Pages env var API_ORIGIN (legacy name: API_PROXY_BASE), e.g. "https://180dcvitc.org".
const API_BASE = "https://admin-api.technical-vitc.workers.dev";

export function resolveApiOrigin(value: unknown): string {
  if (value === undefined) return API_BASE;
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid API_ORIGIN");
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Invalid API_ORIGIN");
  }
  return url.origin;
}

export async function onRequest(context: any) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  let apiOrigin: string;
  try {
    apiOrigin = resolveApiOrigin(env.API_ORIGIN ?? env.API_PROXY_BASE);
  } catch {
    const headers = new Headers({ "Cache-Control": "no-store" });
    addSecurityHeaders(headers);
    return new Response("API origin configuration is invalid", { status: 503, headers });
  }

  // Proxy API requests to the admin-api worker
  if (path.startsWith("/api/")) {
    if (path.includes("..") || path.includes("%2e") || path.includes("%2E")) {
      return new Response("Bad Request", { status: 400 });
    }
    const apiUrl = new URL(path, apiOrigin);
    apiUrl.search = url.search;
    if (!apiUrl.pathname.startsWith("/api/")) {
      return new Response("Forbidden", { status: 403 });
    }
    const apiHeaders = new Headers(request.headers);
    apiHeaders.delete("X-Content-Type-Options");
    apiHeaders.set("Host", new URL(apiOrigin).host);
    const apiResponse = await fetch(apiUrl.toString(), {
      method: request.method,
      headers: apiHeaders,
      redirect: "manual",
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
    });
    const respHeaders = new Headers(apiResponse.headers);
    addSecurityHeaders(respHeaders, apiOrigin);
    if (path.startsWith("/api/case-studies/images/")) {
      respHeaders.set("X-Frame-Options", "SAMEORIGIN");
      respHeaders.delete("Content-Security-Policy");
    }
    respHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return new Response(apiResponse.body, {
      status: apiResponse.status,
      statusText: apiResponse.statusText,
      headers: respHeaders,
    });
  }

  // Serve known static assets — always return a proper 404 instead of HTML
  if (
    path.startsWith("/assets/") ||
    path === "/favicon.svg" ||
    path === "/icons.svg" ||
    path.startsWith("/images/") ||
    path.startsWith("/leads/")
  ) {
    const response = await next();
    if (!response.ok) return response;
    if (path.endsWith(".js") || path.endsWith(".mjs")) {
      response.headers.set("Content-Type", "text/javascript");
    }
    addSecurityHeaders(response.headers, apiOrigin);
    return response;
  }

  const response = await next();

  // SPA fallback: only for navigation (HTML) requests, never for assets
  if (response.status === 404 && !isAssetPath(path)) {
    const index = await env.ASSETS.fetch(new URL("/index.html", url.origin));
    const newResponse = new Response(index.body, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    newResponse.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    addSecurityHeaders(newResponse.headers, apiOrigin);
    return newResponse;
  }

  addSecurityHeaders(response.headers, apiOrigin);
  return response;
}
