import type { Todo, NewTodo, AuthResponse, AdminUser, Project, ProgressEntry, Subtask } from "./types.js";

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

export async function getTodos(projectId?: string, category?: string): Promise<Todo[]> {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (category) params.set("category", category);
  const query = params.toString();
  const res = await send(`${API_BASE}/todos${query ? `?${query}` : ""}`, { headers: authHeaders() });
  if (!res.ok) throw await readError(res, "Failed to load tasks");
  return res.json();
}

export async function createTodo(todo: NewTodo): Promise<Todo> {
  const res = await send(`${API_BASE}/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(todo),
  });
  if (!res.ok) throw await readError(res, "Failed to create task");
  return res.json();
}

export async function updateTodo(todo: Todo): Promise<Todo> {
  const res = await send(`${API_BASE}/todos/${todo.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(todo),
  });
  if (!res.ok) throw await readError(res, "Failed to update task");
  return res.json();
}

export async function claimTodo(id: string): Promise<Todo> {
  const res = await send(`${API_BASE}/todos/${id}/claim`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw await readError(res, "Failed to take task");
  return res.json();
}

export async function releaseTodo(id: string): Promise<Todo> {
  const res = await send(`${API_BASE}/todos/${id}/release`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw await readError(res, "Failed to release task");
  return res.json();
}

export async function deleteTodo(id: string): Promise<void> {
  const res = await send(`${API_BASE}/todos/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw await readError(res, "Failed to delete task");
}

export async function getProgress(todoId: string): Promise<ProgressEntry[]> {
  const res = await send(`${API_BASE}/todos/${todoId}/progress`, { headers: authHeaders() });
  if (!res.ok) throw await readError(res, "Failed to load discussion");
  return res.json();
}

export async function addProgress(todoId: string, text: string): Promise<ProgressEntry> {
  const res = await send(`${API_BASE}/todos/${todoId}/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw await readError(res, "Failed to send message");
  return res.json();
}

export async function createSubtask(todoId: string, title: string): Promise<Subtask> {
  const res = await send(`${API_BASE}/todos/${todoId}/subtasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw await readError(res, "Failed to add subtask");
  return res.json();
}

export async function updateSubtask(subtask: Subtask): Promise<Subtask> {
  const res = await send(`${API_BASE}/todos/${subtask.todoItemId}/subtasks/${subtask.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ title: subtask.title, isDone: subtask.isDone }),
  });
  if (!res.ok) throw await readError(res, "Failed to update subtask");
  return res.json();
}

export async function deleteSubtask(subtask: Subtask): Promise<void> {
  const res = await send(`${API_BASE}/todos/${subtask.todoItemId}/subtasks/${subtask.id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw await readError(res, "Failed to delete subtask");
}

export async function getProjects(): Promise<Project[]> {
  const res = await send(`${API_BASE}/projects`, { headers: authHeaders() });
  if (!res.ok) throw await readError(res, "Failed to load projects");
  return res.json();
}

export async function getProject(id: string): Promise<Project> {
  const res = await send(`${API_BASE}/projects/${id}`, { headers: authHeaders() });
  if (res.status === 404) throw new ApiError("Project not found", ["It may have been deleted, or you are no longer a member"]);
  if (!res.ok) throw await readError(res, "Failed to load project");
  return res.json();
}

export async function createProject(name: string): Promise<Project> {
  const res = await send(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw await readError(res, "Failed to create project");
  return res.json();
}

export async function deleteProject(id: string): Promise<void> {
  const res = await send(`${API_BASE}/projects/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw await readError(res, "Failed to delete project");
}

export async function addProjectMember(projectId: string, email: string): Promise<Project> {
  const res = await send(`${API_BASE}/projects/${projectId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw await readError(res, "Failed to add member");
  return res.json();
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  const res = await send(`${API_BASE}/projects/${projectId}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw await readError(res, "Failed to remove member");
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
