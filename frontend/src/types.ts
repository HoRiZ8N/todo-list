export type Priority = 0 | 1 | 2;

export interface Todo {
  id: string;
  title: string;
  description?: string | null;
  isDone: boolean;
  createdAt: string;
  dueDate?: string | null;
  category?: string | null;
  priority: Priority;
  userId: string;
  authorEmail: string;
  projectId?: string | null;
  assigneeId?: string | null;
  assigneeEmail?: string | null;
  subtasks: Subtask[];
}

export interface Subtask {
  id: string;
  todoItemId: string;
  title: string;
  isDone: boolean;
  authorId: string;
  createdAt: string;
}

export interface NewTodo {
  title: string;
  description?: string;
  category?: string;
  priority: Priority;
  dueDate?: string;
  projectId?: string;
}

export interface ProgressEntry {
  id: string;
  todoItemId: string;
  authorId: string;
  authorEmail: string;
  text: string;
  createdAt: string;
}

export interface ProjectMember {
  userId: string;
  email: string;
  isOwner: boolean;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  ownerId: string;
  ownerEmail: string;
  isOwner: boolean;
  taskCount: number;
  openTaskCount: number;
  members: ProjectMember[];
}

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  isBanned: boolean;
}

export interface AuthResponse {
  token: string;
  email: string;
  role: "User" | "Admin";
}
