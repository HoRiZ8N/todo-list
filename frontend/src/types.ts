export type Priority = 0 | 1 | 2; // Low | Medium | High

export interface Todo {
  id: string;
  title: string;
  description?: string;
  isDone: boolean;
  createdAt: string;
  dueDate?: string;
  category?: string;
  priority: Priority;
  userId: string;
}

export interface AuthResponse {
  token: string;
  email: string;
  role: "User" | "Admin";
}