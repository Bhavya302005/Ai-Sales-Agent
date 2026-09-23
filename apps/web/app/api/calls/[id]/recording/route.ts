import { cookies } from "next/headers";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:8000";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Invalid call", { status: 400 });
  
  let token = (await cookies()).get("sales_agent_session")?.value;
  if (!token) {
    const url = new URL(request.url);
    token = url.searchParams.get("token") || undefined;
  }
  if (!token) {
    try {
      const devRes = await fetch(`${apiBaseUrl}/api/v1/auth/dev-session`, {
        method: "POST",
        cache: "no-store",
      });
      if (devRes.ok) {
        const devData = await devRes.json();
        token = devData.access_token;
      }
    } catch {
      // Ignore fallback error
    }
  }
  if (!token) return new Response("Unauthorized", { status: 401 });

  const range = request.headers.get("range");
  const forwardHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (range) {
    forwardHeaders["Range"] = range;
  }

  const response = await fetch(`${apiBaseUrl}/api/v1/calls/${encodeURIComponent(id)}/recording`, {
    cache: "no-store",
    headers: forwardHeaders,
  });

  if (!response.ok && response.status !== 206) {
    return new Response(response.status === 404 ? "Recording unavailable" : "Unable to load recording", {
      status: response.status,
    });
  }

  const outHeaders = new Headers();
  outHeaders.set("Content-Type", response.headers.get("content-type") ?? "audio/mpeg");
  outHeaders.set("Accept-Ranges", "bytes");
  outHeaders.set("Cache-Control", "private, max-age=3600");
  outHeaders.set("Content-Disposition", "inline");

  const contentRange = response.headers.get("content-range");
  if (contentRange) {
    outHeaders.set("Content-Range", contentRange);
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    outHeaders.set("Content-Length", contentLength);
  }

  return new Response(response.body, {
    status: response.status,
    headers: outHeaders,
  });
}
