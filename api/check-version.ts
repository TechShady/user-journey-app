export default async function () {
  const REPO_API = "https://api.github.com/repos/TechShady/user-journey-app/contents/app.config.json";
  try {
    const res = await fetch(REPO_API, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "dt-app-function" },
    });
    if (!res.ok) return new Response(JSON.stringify({ version: null }), { status: 200 });
    const data = await res.json();
    const raw = atob((data.content ?? "").replace(/\n/g, ""));
    const cfg = JSON.parse(raw);
    return new Response(JSON.stringify({ version: cfg.app?.version ?? null }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ version: null }), { status: 200 });
  }
}
