import type { Todo, AuthResponse } from "./types.js";

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

export async function getTodos(): Promise<Todo[]> {
  const res = await fetch(`${API_BASE}/todos`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Не удалось загрузить задачи");
  return res.json();
}

export async function createTodo(title: string, description?: string): Promise<Todo> {
  const res = await fetch(`${API_BASE}/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ title, description }),
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
