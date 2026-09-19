import type { Todo, AuthResponse, Priority, AdminUser } from "./types.js";

const API_BASE = "http://localhost:5001/api";

export class ApiError extends Error {
  constructor(message: string, public details: string[] = []) {
    super(message);
  }
}

async function send(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError("Server unavailable", ["Check your internet connection and make sure the backend is running"]);
  }
}

async function readError(res: Response, fallback: string): Promise<ApiError> {
  if (res.status >= 500) return new ApiError(fallback, [`Server error (status ${res.status}), please try again later`]);

  const text = await res.text();
  if (!text) return new ApiError(fallback, [`Server returned status ${res.status}`]);

  try {
    const body = JSON.parse(text);
    if (Array.isArray(body.errors)) return new ApiError(body.message ?? fallback, body.errors);
    if (body.errors && typeof body.errors === "object") {
      return new ApiError(fallback, Object.values(body.errors as Record<string, string[]>).flat());
    }
    return new ApiError(body.message ?? body.title ?? fallback);
  } catch {
    return new ApiError(text);
  }
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await send(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await readError(res, "Login failed");
  return res.json();
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const res = await send(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await readError(res, "Sign up failed");
  return res.json();
}

export async function getTodos(category?: string): Promise<Todo[]> {
  const url = category ? `${API_BASE}/todos?category=${encodeURIComponent(category)}` : `${API_BASE}/todos`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load tasks");
  return res.json();
}

export async function createTodo(
  title: string,
  description: string | undefined,
  category: string | undefined,
  priority: Priority,
  dueDate?: string
): Promise<Todo> {
  const res = await fetch(`${API_BASE}/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ title, description, category, priority, dueDate }),
  });
  if (!res.ok) throw new Error("Failed to create task");
  return res.json();
}

export async function updateTodo(todo: Todo): Promise<Todo> {
  const res = await fetch(`${API_BASE}/todos/${todo.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(todo),
  });
  if (!res.ok) throw new Error("Failed to update task");
  return res.json();
}

export async function deleteTodo(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/todos/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete task");
}

export async function getUsers(): Promise<AdminUser[]> {
  const res = await fetch(`${API_BASE}/admin/users`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load users");
  return res.json();
}

export async function banUser(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/users/${id}/ban`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error((await res.text()) || "Failed to ban user");
}

export async function unbanUser(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/users/${id}/unban`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error((await res.text()) || "Failed to unban user");
}
