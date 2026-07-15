import { next } from "@vercel/functions";

export default function middleware(request) {
  const validUser = process.env.SITE_USERNAME || "admin";
  const validPass = process.env.SITE_PASSWORD;

  if (!validPass) {
    return new Response("Site password not configured. Set SITE_PASSWORD in Vercel project settings.", {
      status: 500,
    });
  }

  const auth = request.headers.get("authorization");
  if (auth && auth.startsWith("Basic ")) {
    const decoded = atob(auth.slice(6));
    const sep = decoded.indexOf(":");
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (user === validUser && pass === validPass) {
      return next();
    }
  }

  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Plant Analysis Reports"' },
  });
}
