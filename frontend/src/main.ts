import type { Todo, Priority } from "./types.js";
import { login, register, getTodos, createTodo, updateTodo, deleteTodo } from "./api.js";

const authSection = document.getElementById("auth-section")!;
const appSection = document.getElementById("app-section")!;
const loginForm = document.getElementById("login-form") as HTMLFormElement;
const registerBtn = document.getElementById("register-btn")!;
const emailInput = document.getElementById("email") as HTMLInputElement;
const passwordInput = document.getElementById("password") as HTMLInputElement;
const passwordConfirmInput = document.getElementById("password-confirm") as HTMLInputElement;
const hintLength = document.getElementById("hint-length")!;
const hintMatch = document.getElementById("hint-match")!;
const authError = document.getElementById("auth-error")!;

const MIN_PASSWORD_LENGTH = 6;

function validatePassword(forRegister: boolean): string | null {
  const password = passwordInput.value;

  const lengthOk = password.length >= MIN_PASSWORD_LENGTH;
  hintLength.classList.toggle("ok", lengthOk);
  hintLength.classList.toggle("bad", !lengthOk && password.length > 0);

  if (!forRegister) return lengthOk ? null : `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`;

  const matchOk = password.length > 0 && password === passwordConfirmInput.value;
  hintMatch.classList.toggle("ok", matchOk);
  hintMatch.classList.toggle("bad", !matchOk && passwordConfirmInput.value.length > 0);

  if (!lengthOk) return `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`;
  if (!matchOk) return "Пароли не совпадают";
  return null;
}

passwordInput.addEventListener("input", () => validatePassword(true));
passwordConfirmInput.addEventListener("input", () => validatePassword(true));

const todoForm = document.getElementById("todo-form") as HTMLFormElement;
const titleInput = document.getElementById("title") as HTMLInputElement;
const categoryInput = document.getElementById("category") as HTMLInputElement;
const priorityInput = document.getElementById("priority") as HTMLSelectElement;
const categoryFilterInput = document.getElementById("category-filter") as HTMLInputElement;
const filterBtn = document.getElementById("filter-btn")!;
const filterClearBtn = document.getElementById("filter-clear-btn")!;
const todoList = document.getElementById("todo-list")!;
const roleLabel = document.getElementById("role-label")!;
const logoutBtn = document.getElementById("logout-btn")!;

const PRIORITY_LABELS: Record<Priority, string> = { 0: "Низкий", 1: "Средний", 2: "Высокий" };
const PRIORITY_CLASS: Record<Priority, string> = { 0: "prio-low", 1: "prio-medium", 2: "prio-high" };

function showApp(role: string) {
  authSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  roleLabel.textContent = role === "Admin" ? "Администратор" : "Пользователь";
  void loadTodos();
}

async function loadTodos() {
  todoList.innerHTML = "<li>Загрузка...</li>";
  try {
    const category = categoryFilterInput.value.trim() || undefined;
    const todos = await getTodos(category);
    renderTodos(todos);
  } catch (e) {
    todoList.innerHTML = `<li class="error">${(e as Error).message}</li>`;
  }
}

function renderTodos(todos: Todo[]) {
  todoList.innerHTML = "";
  if (todos.length === 0) {
    todoList.innerHTML = "<li>Задач нет</li>";
    return;
  }

  for (const todo of todos) {
    const li = document.createElement("li");
    li.className = todo.isDone ? "done" : "";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.isDone;
    checkbox.onchange = async () => {
      await updateTodo({ ...todo, isDone: checkbox.checked });
      void loadTodos();
    };

    const info = document.createElement("div");
    info.className = "todo-info";

    const titleRow = document.createElement("div");
    titleRow.className = "todo-title-row";

    const span = document.createElement("span");
    span.textContent = todo.title;
    titleRow.appendChild(span);

    const prioBadge = document.createElement("span");
    prioBadge.className = `badge ${PRIORITY_CLASS[todo.priority]}`;
    prioBadge.textContent = PRIORITY_LABELS[todo.priority];
    titleRow.appendChild(prioBadge);

    info.appendChild(titleRow);

    if (todo.category) {
      const catBadge = document.createElement("span");
      catBadge.className = "badge category";
      catBadge.textContent = todo.category;
      info.appendChild(catBadge);
    }

    const delBtn = document.createElement("button");
    delBtn.textContent = "Удалить";
    delBtn.onclick = async () => {
      await deleteTodo(todo.id);
      void loadTodos();
    };

    li.append(checkbox, info, delBtn);
    todoList.appendChild(li);
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";

  const validationError = validatePassword(false);
  if (validationError) {
    authError.textContent = validationError;
    return;
  }

  try {
    const res = await login(emailInput.value, passwordInput.value);
    localStorage.setItem("token", res.token);
    showApp(res.role);
  } catch (err) {
    authError.textContent = (err as Error).message;
  }
});

registerBtn.addEventListener("click", async () => {
  authError.textContent = "";

  const validationError = validatePassword(true);
  if (validationError) {
    authError.textContent = validationError;
    return;
  }

  try {
    const res = await register(emailInput.value, passwordInput.value);
    localStorage.setItem("token", res.token);
    showApp(res.role);
  } catch (err) {
    authError.textContent = (err as Error).message;
  }
});

todoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!titleInput.value.trim()) return;

  const priority = Number(priorityInput.value) as Priority;
  const category = categoryInput.value.trim() || undefined;

  await createTodo(titleInput.value.trim(), undefined, category, priority);
  titleInput.value = "";
  categoryInput.value = "";
  priorityInput.value = "1";
  void loadTodos();
});

filterBtn.addEventListener("click", () => void loadTodos());
filterClearBtn.addEventListener("click", () => {
  categoryFilterInput.value = "";
  void loadTodos();
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("token");
  appSection.classList.add("hidden");
  authSection.classList.remove("hidden");
});

// Если токен уже есть — сразу показать приложение
if (localStorage.getItem("token")) {
  showApp("User");
}