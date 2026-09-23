import type { Todo, Priority, Project } from "./types.js";
import { getTodos, createTodo, updateTodo, deleteTodo } from "./api.js";

const todoForm = document.getElementById("todo-form") as HTMLFormElement;
const titleInput = document.getElementById("title") as HTMLInputElement;
const descriptionInput = document.getElementById("description") as HTMLTextAreaElement;
const todoError = document.getElementById("todo-error")!;
const categoryInput = document.getElementById("category") as HTMLInputElement;
const priorityInput = document.getElementById("priority") as HTMLSelectElement;
const categoryFilterInput = document.getElementById("category-filter") as HTMLInputElement;
const filterBtn = document.getElementById("filter-btn")!;
const filterClearBtn = document.getElementById("filter-clear-btn")!;
const todoList = document.getElementById("todo-list")!;
const calendarGrid = document.getElementById("calendar-grid")!;
const monthLabel = document.getElementById("month-label")!;
const prevMonthBtn = document.getElementById("prev-month")!;
const nextMonthBtn = document.getElementById("next-month")!;
const todayBtn = document.getElementById("today-btn")!;
const dayTitle = document.getElementById("day-title")!;

const monthFormatter = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", weekday: "long" });

let allTodos: Todo[] = [];
let currentProject: Project | null = null;
let currentUserId: string | null = null;
let editingId: string | null = null;
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

export function openBoard(project: Project, userId: string | null) {
  const switched = currentProject?.id !== project.id;
  currentProject = project;
  currentUserId = userId;
  if (!switched) return;

  allTodos = [];
  editingId = null;
  todoError.textContent = "";
  categoryFilterInput.value = "";
  todoForm.reset();
  priorityInput.value = "1";
  selectDay(new Date());
  void loadTodos();
}

export function closeBoard() {
  currentProject = null;
  allTodos = [];
  editingId = null;
}

async function loadTodos() {
  if (!currentProject) return;
  todoList.innerHTML = "<li>Loading...</li>";
  try {
    const category = categoryFilterInput.value.trim() || undefined;
    allTodos = await getTodos(currentProject.id, category);
    render();
  } catch (e) {
    todoList.innerHTML = "";
    const li = document.createElement("li");
    li.className = "error";
    li.textContent = (e as Error).message;
    todoList.appendChild(li);
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

function canDelete(todo: Todo, project: Project | null): boolean {
  return todo.userId === currentUserId || project?.isOwner === true;
}

async function runTodoAction(action: () => Promise<unknown>) {
  todoError.textContent = "";
  try {
    await action();
  } catch (e) {
    todoError.textContent = (e as Error).message;
  }
  void loadTodos();
}

function renderTodos(todos: Todo[]) {
  todoList.innerHTML = "";
  if (todos.length === 0) {
    todoList.innerHTML = `<li class="empty">No tasks for this day</li>`;
    return;
  }

  const project = currentProject;
  for (const todo of todos) {
    todoList.appendChild(todo.id === editingId ? renderEditor(todo) : renderTodo(todo, project));
  }
}

function renderTodo(todo: Todo, project: Project | null): HTMLLIElement {
  const li = document.createElement("li");
  li.className = todo.isDone ? "done" : "";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = todo.isDone;
  checkbox.onchange = () => void runTodoAction(() => updateTodo({ ...todo, isDone: checkbox.checked }));

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

  if (todo.description) {
    const desc = document.createElement("p");
    desc.className = "todo-description";
    desc.textContent = todo.description;
    info.appendChild(desc);
  }

  const meta = document.createElement("div");
  meta.className = "todo-meta";

  if (todo.category) {
    const catBadge = document.createElement("span");
    catBadge.className = "badge category";
    catBadge.textContent = todo.category;
    meta.appendChild(catBadge);
  }

  if (project) {
    const author = document.createElement("span");
    author.className = "todo-author";
    author.textContent = todo.userId === currentUserId ? "by you" : `by ${todo.authorEmail}`;
    meta.appendChild(author);
  }

  if (meta.childElementCount > 0) info.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "todo-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "edit";
  editBtn.textContent = "Edit";
  editBtn.onclick = () => {
    editingId = todo.id;
    render();
  };
  actions.appendChild(editBtn);

  if (canDelete(todo, project)) {
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.onclick = () => void runTodoAction(() => deleteTodo(todo.id));
    actions.appendChild(delBtn);
  }

  li.append(checkbox, info, actions);
  return li;
}

function renderEditor(todo: Todo): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "editing";

  const form = document.createElement("form");
  form.className = "todo-editor";

  const title = document.createElement("input");
  title.value = todo.title;
  title.maxLength = 200;
  title.required = true;

  const description = document.createElement("textarea");
  description.value = todo.description ?? "";
  description.placeholder = "Description";
  description.maxLength = 4000;
  description.rows = 4;

  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary";
  cancel.textContent = "Cancel";
  cancel.onclick = () => {
    editingId = null;
    render();
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    if (!title.value.trim()) return;
    editingId = null;
    void runTodoAction(() => updateTodo({ ...todo, title: title.value.trim(), description: description.value.trim() || null }));
  };

  form.append(title, description, save, cancel);
  li.appendChild(form);
  queueMicrotask(() => description.focus());
  return li;
}

todoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;

  const project = currentProject;
  if (!project) return;
  void runTodoAction(async () => {
    await createTodo({
      title,
      description: descriptionInput.value.trim() || undefined,
      category: categoryInput.value.trim() || undefined,
      priority: Number(priorityInput.value) as Priority,
      dueDate: `${selectedKey}T00:00:00`,
      projectId: project.id,
    });
    todoForm.reset();
    priorityInput.value = "1";
  });
});

prevMonthBtn.addEventListener("click", () => shiftMonth(-1));
nextMonthBtn.addEventListener("click", () => shiftMonth(1));
todayBtn.addEventListener("click", () => selectDay(new Date()));

filterBtn.addEventListener("click", () => void loadTodos());
filterClearBtn.addEventListener("click", () => {
  categoryFilterInput.value = "";
  void loadTodos();
});
