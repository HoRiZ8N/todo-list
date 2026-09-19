import type { Todo, AuthResponse, Priority, AdminUser } from "./types.js";

const API_BASE = "http://localhost:5001/api";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("Неверный email или пароль");
  return res.json();
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("Не удалось зарегистрироваться");
  return res.json();
}

export async function getTodos(category?: string): Promise<Todo[]> {
  const url = category ? `${API_BASE}/todos?category=${encodeURIComponent(category)}` : `${API_BASE}/todos`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error("Не удалось загрузить задачи");
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
  if (!res.ok) throw new Error("Не удалось создать задачу");
  return res.json();
}

export async function updateTodo(todo: Todo): Promise<Todo> {
  const res = await fetch(`${API_BASE}/todos/${todo.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(todo),
  });
  if (!res.ok) throw new Error("Не удалось обновить задачу");
  return res.json();
}

export async function deleteTodo(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/todos/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Не удалось удалить задачу");
}

export async function getUsers(): Promise<AdminUser[]> {
  const res = await fetch(`${API_BASE}/admin/users`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Не удалось загрузить пользователей");
  return res.json();
}

export async function banUser(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/users/${id}/ban`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error((await res.text()) || "Не удалось заблокировать пользователя");
}

export async function unbanUser(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/users/${id}/unban`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error((await res.text()) || "Не удалось разблокировать пользователя");
}
