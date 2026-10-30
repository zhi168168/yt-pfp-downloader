import handler from "../accounts/runtime.mjs";

export default function account(req, res) {
  const url = new URL(req.url, "https://ytpfp.com");
  const route = url.searchParams.get("__authPath") || "";
  if (!/^[a-zA-Z0-9/_-]*$/.test(route)) {
    res.statusCode = 400;
    return res.end("Invalid account route");
  }
  url.searchParams.delete("__authPath");
  req.url = `/api/auth/${route}${url.search}`;
  return handler(req, res);
}
