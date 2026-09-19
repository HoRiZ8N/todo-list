import type { Todo, Priority } from "./types.js";
import { getTodos, createTodo, updateTodo, deleteTodo } from "./api.js";
import { initAuth } from "./auth.js";
import { mountAdminPanel } from "./admin.js";
import { loadSession, saveSession, clearSession, type Session } from "./session.js";

const authSection = document.getElementById("auth-section")!;
const appSection = document.getElementById("app-section")!;
const todosTab = document.getElementById("todos-tab")!;

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

let unmountAdmin: (() => void) | null = null;

function showApp(session: Session) {
  authSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  roleLabel.textContent = session.isAdmin ? "Administrator" : "User";

  unmountAdmin?.();
  unmountAdmin = session.isAdmin ? mountAdminPanel(todosTab, session.userId) : null;

  void loadTodos();
}

function showAuth() {
  unmountAdmin?.();
  unmountAdmin = null;
  allTodos = [];
  appSection.classList.add("hidden");
  authSection.classList.remove("hidden");
  resetAuth();
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

const resetAuth = initAuth((token) => {
  const session = saveSession(token);
  if (session) showApp(session);
});

logoutBtn.addEventListener("click", () => {
  clearSession();
  showAuth();
});

const session = loadSession();
if (session) showApp(session);
