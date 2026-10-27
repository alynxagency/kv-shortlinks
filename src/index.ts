// One or more safe segments: "meet", "s/xyz", "a/b/c". No empty segments, dots, or %-escapes.
const SLUG = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const MAX_SLUG = 256;
const HTTP_URL = /^https?:\/\//i;

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const slug = new URL(request.url).pathname.slice(1);
    const target =
      slug === "" ? env.ROOT_URL
      : slug.length <= MAX_SLUG && SLUG.test(slug) ? await env.LINKS.get(slug)
      : null;

    if (target && HTTP_URL.test(target) && URL.canParse(target)) {
      return Response.redirect(target, 302);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
