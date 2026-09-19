import type { Todo, Priority, AdminUser } from "./types.js";
import {
  login, register, getTodos, createTodo, updateTodo, deleteTodo,
  getUsers, banUser, unbanUser,
  ApiError,
} from "./api.js";

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

interface PasswordRule {
  hint: HTMLElement;
  test: (password: string) => boolean;
  message: string;
}

const lengthRule: PasswordRule = {
  hint: hintLength,
  test: (p) => p.length >= MIN_PASSWORD_LENGTH,
  message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
};

const PASSWORD_RULES: PasswordRule[] = [
  lengthRule,
  { hint: document.getElementById("hint-digit")!, test: (p) => /[0-9]/.test(p), message: "Password must contain a digit" },
  { hint: document.getElementById("hint-lower")!, test: (p) => /[a-z]/.test(p), message: "Password must contain a lowercase letter (a-z)" },
  { hint: document.getElementById("hint-upper")!, test: (p) => /[A-Z]/.test(p), message: "Password must contain an uppercase letter (A-Z)" },
];

function validatePassword(forRegister: boolean): string | null {
  const password = passwordInput.value;

  for (const rule of PASSWORD_RULES) {
    const ok = rule.test(password);
    rule.hint.classList.toggle("ok", ok);
    rule.hint.classList.toggle("bad", !ok && password.length > 0);
  }

  if (!forRegister) return lengthRule.test(password) ? null : lengthRule.message;

  const matchOk = password.length > 0 && password === passwordConfirmInput.value;
  hintMatch.classList.toggle("ok", matchOk);
  hintMatch.classList.toggle("bad", !matchOk && passwordConfirmInput.value.length > 0);

  const failed = PASSWORD_RULES.find((rule) => !rule.test(password));
  if (failed) return failed.message;
  if (!matchOk) return "Passwords do not match";
  return null;
}

function showAuthError(err: unknown) {
  const error = err instanceof ApiError ? err : new ApiError((err as Error).message);
  authError.innerHTML = "";

  const title = document.createElement("p");
  title.textContent = error.message;
  authError.appendChild(title);

  if (error.details.length === 0) return;

  const list = document.createElement("ul");
  list.className = "error-list";
  for (const detail of error.details) {
    const li = document.createElement("li");
    li.textContent = detail;
    list.appendChild(li);
  }
  authError.appendChild(list);
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
const calendarGrid = document.getElementById("calendar-grid")!;
const monthLabel = document.getElementById("month-label")!;
const prevMonthBtn = document.getElementById("prev-month")!;
const nextMonthBtn = document.getElementById("next-month")!;
const todayBtn = document.getElementById("today-btn")!;
const dayTitle = document.getElementById("day-title")!;

const monthFormatter = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", weekday: "long" });

let allTodos: Todo[] = [];
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let selectedKey = toKey(new Date());

function toKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todoKey(todo: Todo): string {
  if (todo.dueDate) return todo.dueDate.slice(0, 10);
  const created = /(Z|[+-]\d{2}:\d{2})$/.test(todo.createdAt) ? todo.createdAt : `${todo.createdAt}Z`;
  return toKey(new Date(created));
}

function groupByDay(todos: Todo[]): Map<string, Todo[]> {
  const map = new Map<string, Todo[]>();
  for (const todo of todos) {
    const key = todoKey(todo);
    const list = map.get(key);
    if (list) list.push(todo);
    else map.set(key, [todo]);
  }
  return map;
}

const PRIORITY_LABELS: Record<Priority, string> = { 0: "Low", 1: "Medium", 2: "High" };
const PRIORITY_CLASS: Record<Priority, string> = { 0: "prio-low", 1: "prio-medium", 2: "prio-high" };

const tabs = document.getElementById("tabs")!;
const tabTodos = document.getElementById("tab-todos")!;
const tabUsers = document.getElementById("tab-users")!;
const todosTab = document.getElementById("todos-tab")!;
const usersTab = document.getElementById("users-tab")!;
const usersTbody = document.getElementById("users-tbody")!;

let currentUserId: string | null = null;

function parseUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub ?? payload.nameid ?? null;
  } catch {
    return null;
  }
}

tabTodos.addEventListener("click", () => switchTab("todos"));
tabUsers.addEventListener("click", () => switchTab("users"));

function switchTab(tab: "todos" | "users") {
  tabTodos.classList.toggle("active", tab === "todos");
  tabUsers.classList.toggle("active", tab === "users");
  todosTab.classList.toggle("hidden", tab !== "todos");
  usersTab.classList.toggle("hidden", tab !== "users");
  if (tab === "users") void loadUsers();
}

async function loadUsers() {
  usersTbody.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;
  try {
    const users = await getUsers();
    renderUsers(users);
  } catch (e) {
    usersTbody.innerHTML = `<tr><td colspan="4" class="error">${(e as Error).message}</td></tr>`;
  }
}

function renderUsers(users: AdminUser[]) {
  usersTbody.innerHTML = "";
  for (const u of users) {
    const tr = document.createElement("tr");

    const emailTd = document.createElement("td");
    emailTd.textContent = u.email;

    const roleTd = document.createElement("td");
    roleTd.textContent = u.role === "Admin" ? "Administrator" : "User";

    const statusTd = document.createElement("td");
    statusTd.textContent = u.isBanned ? "Banned" : "Active";
    statusTd.className = u.isBanned ? "status-banned" : "status-active";

    const actionTd = document.createElement("td");
    if (u.id !== currentUserId) {
      const btn = document.createElement("button");
      btn.textContent = u.isBanned ? "Unban" : "Ban";
      btn.className = u.isBanned ? "unban" : "ban";
      btn.onclick = async () => {
        try {
          if (u.isBanned) await unbanUser(u.id);
          else await banUser(u.id);
          void loadUsers();
        } catch (e) {
          alert((e as Error).message);
        }
      };
      actionTd.appendChild(btn);
    } else {
      actionTd.textContent = "— you";
    }

    tr.append(emailTd, roleTd, statusTd, actionTd);
    usersTbody.appendChild(tr);
  }
}

function showApp(role: string, token: string) {
  authSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  roleLabel.textContent = role === "Admin" ? "Administrator" : "User";
  currentUserId = parseUserIdFromToken(token);

  if (role === "Admin") {
    tabs.classList.remove("hidden");
  } else {
    tabs.classList.add("hidden");
    todosTab.classList.remove("hidden");
    usersTab.classList.add("hidden");
  }

  void loadTodos();
}

async function loadTodos() {
  todoList.innerHTML = "<li>Loading...</li>";
  try {
    const category = categoryFilterInput.value.trim() || undefined;
    allTodos = await getTodos(category);
    render();
  } catch (e) {
    todoList.innerHTML = `<li class="error">${(e as Error).message}</li>`;
  }
}

function render() {
  const byDay = groupByDay(allTodos);
  renderCalendar(byDay);
  renderDay(byDay.get(selectedKey) ?? []);
}

function renderCalendar(byDay: Map<string, Todo[]>) {
  const label = monthFormatter.format(new Date(viewYear, viewMonth, 1));
  monthLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);

  const offset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const todayKey = toKey(new Date());

  calendarGrid.innerHTML = "";
  for (let i = 0; i < 42; i++) {
    const date = new Date(viewYear, viewMonth, 1 - offset + i);
    const key = toKey(date);
    const todos = byDay.get(key) ?? [];
    const pending = todos.filter((t) => !t.isDone).length;

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day-cell";
    cell.classList.toggle("other-month", date.getMonth() !== viewMonth);
    cell.classList.toggle("today", key === todayKey);
    cell.classList.toggle("selected", key === selectedKey);
    cell.classList.toggle("weekend", date.getDay() === 0 || date.getDay() === 6);

    const num = document.createElement("span");
    num.className = "day-num";
    num.textContent = String(date.getDate());
    cell.appendChild(num);

    if (todos.length > 0) {
      const count = document.createElement("span");
      count.className = pending > 0 ? "day-count" : "day-count all-done";
      count.textContent = pending > 0 ? String(pending) : "✓";
      cell.appendChild(count);
      cell.title = `Tasks: ${todos.length}, pending: ${pending}`;
    }

    cell.onclick = () => selectDay(date);
    calendarGrid.appendChild(cell);
  }
}

function selectDay(date: Date) {
  selectedKey = toKey(date);
  viewYear = date.getFullYear();
  viewMonth = date.getMonth();
  render();
}

function shiftMonth(delta: number) {
  const d = new Date(viewYear, viewMonth + delta, 1);
  viewYear = d.getFullYear();
  viewMonth = d.getMonth();
  render();
}

function renderDay(todos: Todo[]) {
  const title = dayFormatter.format(fromKey(selectedKey));
  dayTitle.textContent = title.charAt(0).toUpperCase() + title.slice(1);
  renderTodos([...todos].sort((a, b) => Number(a.isDone) - Number(b.isDone) || b.priority - a.priority));
}

function renderTodos(todos: Todo[]) {
  todoList.innerHTML = "";
  if (todos.length === 0) {
    todoList.innerHTML = `<li class="empty">No tasks for this day</li>`;
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
    delBtn.textContent = "Delete";
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
    localStorage.setItem("role", res.role);
    showApp(res.role, res.token);
  } catch (err) {
    showAuthError(err);
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
    localStorage.setItem("role", res.role);
    showApp(res.role, res.token);
  } catch (err) {
    showAuthError(err);
  }
});

todoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!titleInput.value.trim()) return;

  const priority = Number(priorityInput.value) as Priority;
  const category = categoryInput.value.trim() || undefined;

  await createTodo(titleInput.value.trim(), undefined, category, priority, `${selectedKey}T00:00:00`);
  titleInput.value = "";
  categoryInput.value = "";
  priorityInput.value = "1";
  void loadTodos();
});

prevMonthBtn.addEventListener("click", () => shiftMonth(-1));
nextMonthBtn.addEventListener("click", () => shiftMonth(1));
todayBtn.addEventListener("click", () => selectDay(new Date()));

filterBtn.addEventListener("click", () => void loadTodos());
filterClearBtn.addEventListener("click", () => {
  categoryFilterInput.value = "";
  void loadTodos();
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  appSection.classList.add("hidden");
  authSection.classList.remove("hidden");
});

const savedToken = localStorage.getItem("token");
if (savedToken) {
  showApp(localStorage.getItem("role") ?? "User", savedToken);
}
