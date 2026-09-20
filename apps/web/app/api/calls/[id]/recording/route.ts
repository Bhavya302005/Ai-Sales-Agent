import { cookies } from "next/headers";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:8000";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Invalid call", { status: 400 });
  const token = (await cookies()).get("sales_agent_session")?.value;
  if (!token) return new Response("Unauthorized", { status: 401 });
  const response = await fetch(`${apiBaseUrl}/api/v1/calls/${encodeURIComponent(id)}/recording`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok || !response.body) {
    return new Response(response.status === 404 ? "Recording unavailable" : "Unable to load recording", {
      status: response.status,
    });
  }
  return new Response(response.body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": response.headers.get("content-type") ?? "audio/mpeg",
    },
  });
}
