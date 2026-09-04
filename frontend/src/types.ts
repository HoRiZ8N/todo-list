export interface Todo {
  id: string;
  title: string;
  description?: string;
  isDone: boolean;
  createdAt: string;
  dueDate?: string;
  userId: string;
}

export interface AuthResponse {
  token: string;
  email: string;
  role: "User" | "Admin";
}
