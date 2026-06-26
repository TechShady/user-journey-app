export default async function () {
  const REPO_API = "https://api.github.com/repos/TechShady/user-journey-app/contents/app.config.json";
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const res = await fetch(REPO_API, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "dt-app-function" },
      signal: controller.signal,
    });
    if (!res.ok) return new Response(JSON.stringify({ version: null, error: `status ${res.status}` }), { status: 200 });
    const data = (await res.json()) as any;
    const raw = atob(((data as any).content ?? "").replace(/\n/g, ""));
    const cfg = JSON.parse(raw);
    return new Response(JSON.stringify({ version: (cfg as any).app?.version ?? null }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ version: null, error: String(e?.message ?? e) }), { status: 200 });
  }
}
