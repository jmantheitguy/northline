export function GET() {
  return Response.json({
    status: "ok",
    service: "northline",
    timestamp: new Date().toISOString(),
  });
}
