import type { Todo, Priority, Project } from "./types.js";
import { getTodos, createTodo, updateTodo, deleteTodo, claimTodo, releaseTodo } from "./api.js";
import { errorText } from "./projects.js";

type Scope = "day" | "all";
type ListFilter = "all" | "open" | "mine" | "unassigned" | "done";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const todoForm = byId<HTMLFormElement>("todo-form");
const titleInput = byId<HTMLInputElement>("title");
const descriptionInput = byId<HTMLTextAreaElement>("description");
const categoryInput = byId<HTMLInputElement>("category");
const priorityInput = byId<HTMLSelectElement>("priority");
const todoError = byId<HTMLElement>("todo-error");
const categoryFilterInput = byId<HTMLInputElement>("category-filter");
const filterBtn = byId<HTMLButtonElement>("filter-btn");
const filterClearBtn = byId<HTMLButtonElement>("filter-clear-btn");
const dayList = byId<HTMLUListElement>("todo-list");
const allList = byId<HTMLUListElement>("all-todo-list");
const allFilter = byId<HTMLSelectElement>("all-filter");
const allCount = byId<HTMLElement>("all-count");
const calendarGrid = byId<HTMLElement>("calendar-grid");
const monthLabel = byId<HTMLElement>("month-label");
const prevMonthBtn = byId<HTMLButtonElement>("prev-month");
const nextMonthBtn = byId<HTMLButtonElement>("next-month");
const todayBtn = byId<HTMLButtonElement>("today-btn");
const dayTitle = byId<HTMLElement>("day-title");

const monthFormatter = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", weekday: "long" });
const shortDayFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

const PRIORITY_LABELS: Record<Priority, string> = { 0: "Low", 1: "Medium", 2: "High" };
const PRIORITY_CLASS: Record<Priority, string> = { 0: "prio-low", 1: "prio-medium", 2: "prio-high" };

const LIST_FILTERS: Record<ListFilter, (todo: Todo, userId: string | null) => boolean> = {
  all: () => true,
  open: (t) => !t.isDone,
  mine: (t, userId) => t.assigneeId === userId,
  unassigned: (t) => !t.isDone && !t.assigneeId,
  done: (t) => t.isDone,
};

let allTodos: Todo[] = [];
let currentProject: Project | null = null;
let currentUserId: string | null = null;
let editing: string | null = null;
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

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function openBoard(project: Project, userId: string | null) {
  const switched = currentProject?.id !== project.id;
  currentProject = project;
  currentUserId = userId;
  if (!switched) {
    render();
    return;
  }

  allTodos = [];
  editing = null;
  todoError.textContent = "";
  categoryFilterInput.value = "";
  allFilter.value = "open";
  todoForm.reset();
  priorityInput.value = "1";
  selectDay(new Date());
  void loadTodos();
}

export function closeBoard() {
  currentProject = null;
  allTodos = [];
  editing = null;
}

async function loadTodos() {
  const project = currentProject;
  if (!project) return;
  try {
    const todos = await getTodos(project.id, categoryFilterInput.value.trim() || undefined);
    if (project !== currentProject) return;
    allTodos = todos;
    render();
  } catch (e) {
    todoError.textContent = errorText(e);
  }
}

async function runTodoAction(action: () => Promise<unknown>) {
  todoError.textContent = "";
  try {
    await action();
  } catch (e) {
    todoError.textContent = errorText(e);
  }
  await loadTodos();
}

function render() {
  const byDay = groupByDay(allTodos);
  renderCalendar(byDay);
  renderDay(byDay.get(selectedKey) ?? []);
  renderAll();
}

function renderCalendar(byDay: Map<string, Todo[]>) {
  monthLabel.textContent = capitalize(monthFormatter.format(new Date(viewYear, viewMonth, 1)));

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

function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort(
    (a, b) =>
      Number(a.isDone) - Number(b.isDone) ||
      todoKey(a).localeCompare(todoKey(b)) ||
      b.priority - a.priority ||
      a.title.localeCompare(b.title)
  );
}

function renderDay(todos: Todo[]) {
  dayTitle.textContent = capitalize(dayFormatter.format(fromKey(selectedKey)));
  renderList(dayList, "day", sortTodos(todos), "No tasks for this day");
}

function renderAll() {
  const filter = LIST_FILTERS[allFilter.value as ListFilter] ?? LIST_FILTERS.all;
  const todos = sortTodos(allTodos.filter((t) => filter(t, currentUserId)));
  allCount.textContent = String(todos.length);
  renderList(allList, "all", todos, "No tasks");
}

function renderList(list: HTMLUListElement, scope: Scope, todos: Todo[], emptyText: string) {
  list.innerHTML = "";
  if (todos.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = emptyText;
    list.appendChild(li);
    return;
  }
  for (const todo of todos) {
    list.appendChild(editing === `${scope}:${todo.id}` ? renderEditor(todo) : renderTodo(todo, scope));
  }
}

function isProjectOwner(): boolean {
  return currentProject?.isOwner === true;
}

function canDelete(todo: Todo): boolean {
  return todo.userId === currentUserId || isProjectOwner();
}

function canRelease(todo: Todo): boolean {
  return todo.assigneeId === currentUserId || isProjectOwner();
}

function badge(className: string, text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `badge ${className}`;
  span.textContent = text;
  return span;
}

function actionButton(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = text;
  btn.onclick = onClick;
  return btn;
}

function renderTodo(todo: Todo, scope: Scope): HTMLLIElement {
  const li = document.createElement("li");
  li.classList.toggle("done", todo.isDone);
  li.classList.toggle("mine", todo.assigneeId === currentUserId);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = todo.isDone;
  checkbox.onchange = () => void runTodoAction(() => updateTodo({ ...todo, isDone: checkbox.checked }));

  const info = document.createElement("div");
  info.className = "todo-info";

  const titleRow = document.createElement("div");
  titleRow.className = "todo-title-row";
  const title = document.createElement("span");
  title.className = "todo-title";
  title.textContent = todo.title;
  titleRow.append(title, badge(PRIORITY_CLASS[todo.priority], PRIORITY_LABELS[todo.priority]));
  info.appendChild(titleRow);

  if (todo.description) {
    const desc = document.createElement("p");
    desc.className = scope === "all" ? "todo-description clamp" : "todo-description";
    desc.textContent = todo.description;
    info.appendChild(desc);
  }

  const meta = document.createElement("div");
  meta.className = "todo-meta";

  if (scope === "all") {
    const key = todoKey(todo);
    const date = actionButton(shortDayFormatter.format(fromKey(key)), "date-link", () => selectDay(fromKey(key)));
    date.title = "Show in calendar";
    meta.appendChild(date);
  }

  if (todo.category) meta.appendChild(badge("category", todo.category));

  if (todo.assigneeId) {
    const mine = todo.assigneeId === currentUserId;
    meta.appendChild(badge(mine ? "assignee mine" : "assignee", mine ? "Taken by you" : `Taken by ${todo.assigneeEmail ?? "unknown"}`));
  }

  const author = document.createElement("span");
  author.className = "todo-author";
  author.textContent = todo.userId === currentUserId ? "created by you" : `created by ${todo.authorEmail}`;
  meta.appendChild(author);

  info.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "todo-actions";

  if (!todo.assigneeId && !todo.isDone) {
    actions.appendChild(actionButton("Take", "take", () => void runTodoAction(() => claimTodo(todo.id))));
  } else if (todo.assigneeId && canRelease(todo)) {
    actions.appendChild(actionButton("Release", "release", () => void runTodoAction(() => releaseTodo(todo.id))));
  }

  actions.appendChild(actionButton("Edit", "edit", () => {
    editing = `${scope}:${todo.id}`;
    render();
  }));

  if (canDelete(todo)) {
    actions.appendChild(actionButton("Delete", "delete", () => {
      if (confirm(`Delete task "${todo.title}"?`)) void runTodoAction(() => deleteTodo(todo.id));
    }));
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
  title.placeholder = "Title";
  title.maxLength = 200;
  title.required = true;

  const description = document.createElement("textarea");
  description.value = todo.description ?? "";
  description.placeholder = "Description";
  description.maxLength = 4000;
  description.rows = 4;

  const category = document.createElement("input");
  category.value = todo.category ?? "";
  category.placeholder = "Category";
  category.maxLength = 100;

  const priority = document.createElement("select");
  for (const [value, label] of Object.entries(PRIORITY_LABELS)) {
    priority.add(new Option(`${label} priority`, value, false, Number(value) === todo.priority));
  }

  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save";

  const cancel = actionButton("Cancel", "secondary", () => {
    editing = null;
    render();
  });

  form.onsubmit = (e) => {
    e.preventDefault();
    if (!title.value.trim()) return;
    editing = null;
    void runTodoAction(() =>
      updateTodo({
        ...todo,
        title: title.value.trim(),
        description: description.value.trim() || null,
        category: category.value.trim() || null,
        priority: Number(priority.value) as Priority,
      })
    );
  };

  form.append(title, description, category, priority, save, cancel);
  li.appendChild(form);
  queueMicrotask(() => title.focus());
  return li;
}

todoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  const project = currentProject;
  if (!title || !project) return;

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
allFilter.addEventListener("change", renderAll);

filterBtn.addEventListener("click", () => void loadTodos());
filterClearBtn.addEventListener("click", () => {
  categoryFilterInput.value = "";
  void loadTodos();
});
