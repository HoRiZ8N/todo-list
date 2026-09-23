export type Route =
  | { page: "list" }
  | { page: "create" }
  | { page: "project"; id: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "");
  if (path === "/projects/new") return { page: "create" };
  const match = /^\/projects\/([0-9a-f-]{36})$/i.exec(path);
  if (match) return { page: "project", id: match[1] };
  return { page: "list" };
}

export const routes = {
  list: "#/",
  create: "#/projects/new",
  project: (id: string) => `#/projects/${id}`,
};

export function navigate(hash: string) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
}
