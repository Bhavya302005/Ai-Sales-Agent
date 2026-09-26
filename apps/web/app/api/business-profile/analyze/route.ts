import { cookies } from "next/headers";

const apiBaseUrl = (
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/+$/, "");

export async function POST(request: Request) {
  const token = (await cookies()).get("sales_agent_session")?.value;
  if (!token) return Response.json({ detail: "Sign in to continue" }, { status: 401 });
  const submitted = await request.formData();
  const formData = new FormData();
  for (const [key, value] of submitted.entries()) {
    if (key === "documents" && (typeof value === "string" || value.size === 0)) continue;
    formData.append(key, value);
  }
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/knowledge/business-profile/analyze`, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Failed to connect to backend service" },
      { status: 502 },
    );
  }
}
