const API_URL = process.env.API_URL ?? "http://localhost:3000";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    businessId?: string;
    eventType?: string;
    googleReviewId?: string;
    referrer?: string;
  } | null;

  if (!payload?.businessId || !payload.eventType) {
    return Response.json(
      { message: "Evento de widget inválido" },
      { status: 400 },
    );
  }

  const upstream = await fetch(
    `${API_URL}/public/widgets/business/${encodeURIComponent(payload.businessId)}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: payload.eventType,
        googleReviewId: payload.googleReviewId,
        referrer: payload.referrer,
      }),
    },
  );
  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
