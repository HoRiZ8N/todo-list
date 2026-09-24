import type { Todo, Priority, Project, ProgressEntry, Subtask } from "./types.js";
import {
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  claimTodo,
  releaseTodo,
  getProgress,
  addProgress,
  createSubtask,
  updateSubtask,
  deleteSubtask,
} from "./api.js";
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
const progressDateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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

const progressOpen = new Set<string>();
const progressEntries = new Map<string, ProgressEntry[]>();
const progressLoading = new Set<string>();
const progressError = new Map<string, string>();

const subtasksOpen = new Set<string>();
let editingSubtask: string | null = null;
let focusSubtaskInput: string | null = null;

function resetPanelState() {
  progressOpen.clear();
  progressEntries.clear();
  progressLoading.clear();
  progressError.clear();
  subtasksOpen.clear();
  editingSubtask = null;
  focusSubtaskInput = null;
}

function toKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toUtcDate(iso: string): Date {
  return new Date(/(Z|[+-]\d{2}:\d{2})$/.test(iso) ? iso : `${iso}Z`);
}

function todoKey(todo: Todo): string {
  if (todo.dueDate) return todo.dueDate.slice(0, 10);
  return toKey(toUtcDate(todo.createdAt));
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
  resetPanelState();
  selectDay(new Date());
  void loadTodos();
}

export function closeBoard() {
  currentProject = null;
  allTodos = [];
  editing = null;
  resetPanelState();
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

function toggleProgress(id: string) {
  if (progressOpen.has(id)) {
    progressOpen.delete(id);
    render();
    return;
  }
  progressOpen.add(id);
  render();
  if (!progressEntries.has(id)) void loadProgress(id);
}

async function loadProgress(id: string) {
  progressLoading.add(id);
  progressError.delete(id);
  render();
  try {
    const entries = await getProgress(id);
    progressEntries.set(id, entries);
  } catch (e) {
    progressError.set(id, errorText(e));
  } finally {
    progressLoading.delete(id);
    render();
  }
}

async function submitProgress(id: string, text: string) {
  progressError.delete(id);
  try {
    const entry = await addProgress(id, text);
    progressEntries.set(id, [...(progressEntries.get(id) ?? []), entry]);
  } catch (e) {
    progressError.set(id, errorText(e));
  }
  render();
}

function toggleSubtasks(id: string) {
  if (subtasksOpen.has(id)) subtasksOpen.delete(id);
  else subtasksOpen.add(id);
  render();
}

function render() {
  todoForm.classList.toggle("hidden", !isProjectOwner());
  const byDay = groupByDay(allTodos);
  renderCalendar(byDay);
  renderDay(byDay.get(selectedKey) ?? []);
  renderAll();
  restoreSubtaskFocus();
}

function restoreSubtaskFocus() {
  if (!focusSubtaskInput) return;
  const input = document.querySelector<HTMLInputElement>(`[data-subtask-input="${focusSubtaskInput}"]`);
  focusSubtaskInput = null;
  input?.focus();
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
  checkbox.disabled = !isProjectOwner();
  checkbox.onchange = () => {
    const open = todo.subtasks.filter((s) => !s.isDone).length;
    if (checkbox.checked && open > 0 && !confirm(`${open} subtask(s) are still open. Mark the task as done anyway?`)) {
      checkbox.checked = false;
      return;
    }
    void runTodoAction(() => updateTodo({ ...todo, isDone: checkbox.checked }));
  };

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

  if (todo.subtasks.length > 0) {
    const done = todo.subtasks.filter((s) => s.isDone).length;
    const counter = actionButton(`☑ ${done}/${todo.subtasks.length}`, "subtask-count", () => toggleSubtasks(todo.id));
    counter.classList.toggle("complete", done === todo.subtasks.length);
    counter.title = "Show subtasks";
    meta.appendChild(counter);
  }

  if (todo.category) meta.appendChild(badge("category", todo.category));

  if (todo.assigneeId) {
    const mine = todo.assigneeId === currentUserId;
    meta.appendChild(badge(mine ? "assignee mine" : "assignee", mine ? "Taken by you" : `Taken by ${todo.assigneeEmail ?? "unknown"}`));
  }

  const author = document.createElement("span");
  author.className = "todo-author";
  author.textContent = todo.userId === currentUserId ? "created by you" : `created by ${todo.authorEmail || "deleted user"}`;
  meta.appendChild(author);

  info.appendChild(meta);

  if (subtasksOpen.has(todo.id)) {
    info.appendChild(renderSubtaskPanel(todo, scope));
  }

  if (progressOpen.has(todo.id)) {
    info.appendChild(renderProgressPanel(todo));
  }

  const actions = document.createElement("div");
  actions.className = "todo-actions";

  if (!todo.assigneeId && !todo.isDone) {
    actions.appendChild(actionButton("Take", "take", () => void runTodoAction(() => claimTodo(todo.id))));
  } else if (todo.assigneeId && canRelease(todo)) {
    actions.appendChild(actionButton("Release", "release", () => void runTodoAction(() => releaseTodo(todo.id))));
  }

  if (isProjectOwner() || todo.subtasks.length > 0) {
    actions.appendChild(actionButton(
      subtasksOpen.has(todo.id) ? "Hide subtasks" : "Subtasks",
      "subtasks-toggle",
      () => toggleSubtasks(todo.id)
    ));
  }

  actions.appendChild(actionButton(
    progressOpen.has(todo.id) ? "Hide discussion" : "Discussion",
    "progress-toggle",
    () => toggleProgress(todo.id)
  ));

  if (isProjectOwner()) {
    actions.appendChild(actionButton("Edit", "edit", () => {
      editing = `${scope}:${todo.id}`;
      render();
    }));
  }

  if (canDelete(todo)) {
    actions.appendChild(actionButton("Delete", "delete", () => {
      if (confirm(`Delete task "${todo.title}"?`)) void runTodoAction(() => deleteTodo(todo.id));
    }));
  }

  li.append(checkbox, info, actions);
  return li;
}

function canDeleteSubtask(todo: Todo, subtask: Subtask): boolean {
  return subtask.authorId === currentUserId || canDelete(todo);
}

function renderSubtaskPanel(todo: Todo, scope: Scope): HTMLDivElement {
  const panel = document.createElement("div");
  panel.className = "subtask-panel";

  const heading = document.createElement("div");
  heading.className = "progress-heading";
  heading.textContent = "Subtasks";
  panel.appendChild(heading);

  if (todo.subtasks.length > 0) {
    const done = todo.subtasks.filter((s) => s.isDone).length;
    const bar = document.createElement("div");
    bar.className = "subtask-bar";
    const fill = document.createElement("div");
    fill.className = "subtask-bar-fill";
    fill.style.width = `${Math.round((done / todo.subtasks.length) * 100)}%`;
    bar.appendChild(fill);
    panel.appendChild(bar);

    const list = document.createElement("ul");
    list.className = "subtask-list";
    for (const subtask of todo.subtasks) {
      list.appendChild(editingSubtask === `${scope}:${subtask.id}` ? renderSubtaskEditor(subtask) : renderSubtask(todo, subtask, scope));
    }
    panel.appendChild(list);
  }

  if (isProjectOwner()) {
    panel.appendChild(renderSubtaskForm(todo, scope));
  } else if (todo.subtasks.length === 0) {
    const status = document.createElement("p");
    status.className = "progress-status";
    status.textContent = "No subtasks";
    panel.appendChild(status);
  }

  return panel;
}

function renderSubtask(todo: Todo, subtask: Subtask, scope: Scope): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "subtask";
  li.classList.toggle("done", subtask.isDone);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = subtask.isDone;
  checkbox.disabled = !isProjectOwner() && todo.assigneeId !== currentUserId;
  checkbox.onchange = () => void runTodoAction(() => updateSubtask({ ...subtask, isDone: checkbox.checked }));

  const title = document.createElement("span");
  title.className = "subtask-title";
  title.textContent = subtask.title;
  if (isProjectOwner()) {
    title.title = "Double-click to rename";
    title.ondblclick = () => {
      editingSubtask = `${scope}:${subtask.id}`;
      focusSubtaskInput = editingSubtask;
      render();
    };
  }

  li.append(checkbox, title);

  if (canDeleteSubtask(todo, subtask)) {
    const remove = actionButton("×", "subtask-delete", () => void runTodoAction(() => deleteSubtask(subtask)));
    remove.title = "Delete subtask";
    li.appendChild(remove);
  }

  return li;
}

function renderSubtaskEditor(subtask: Subtask): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "subtask editing";

  const input = document.createElement("input");
  input.value = subtask.title;
  input.maxLength = 200;
  input.dataset.subtaskInput = editingSubtask ?? "";

  let finished = false;
  const finish = (save: boolean) => {
    if (finished) return;
    finished = true;
    editingSubtask = null;
    const title = input.value.trim();
    if (save && title && title !== subtask.title) {
      void runTodoAction(() => updateSubtask({ ...subtask, title }));
    } else {
      render();
    }
  };

  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      finish(false);
    }
  };
  input.onblur = () => finish(true);

  li.appendChild(input);
  return li;
}

function renderSubtaskForm(todo: Todo, scope: Scope): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "subtask-form";

  const key = `${scope}:${todo.id}`;
  const input = document.createElement("input");
  input.placeholder = "Add a subtask…";
  input.maxLength = 200;
  input.required = true;
  input.dataset.subtaskInput = key;

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Add";

  form.onsubmit = (e) => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    input.value = "";
    focusSubtaskInput = key;
    void runTodoAction(() => createSubtask(todo.id, title));
  };

  form.append(input, submit);
  return form;
}

function renderProgressPanel(todo: Todo): HTMLDivElement {
  const panel = document.createElement("div");
  panel.className = "progress-panel";

  const heading = document.createElement("div");
  heading.className = "progress-heading";
  heading.textContent = "Discussion";
  panel.appendChild(heading);

  if (progressLoading.has(todo.id)) {
    const status = document.createElement("p");
    status.className = "progress-status";
    status.textContent = "Loading…";
    panel.appendChild(status);
  } else if (progressError.has(todo.id)) {
    const status = document.createElement("p");
    status.className = "progress-status error";
    status.textContent = progressError.get(todo.id)!;
    panel.appendChild(status);
  } else {
    const entries = progressEntries.get(todo.id) ?? [];
    if (entries.length === 0) {
      const status = document.createElement("p");
      status.className = "progress-status";
      status.textContent = "No messages yet";
      panel.appendChild(status);
    } else {
      panel.appendChild(renderProgressList(entries));
    }
  }

  if ((todo.assigneeId && todo.assigneeId === currentUserId) || isProjectOwner()) {
    panel.appendChild(renderProgressForm(todo));
  }

  return panel;
}

function renderProgressList(entries: ProgressEntry[]): HTMLUListElement {
  const list = document.createElement("ul");
  list.className = "progress-list";

  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = "progress-entry";

    const head = document.createElement("div");
    head.className = "progress-entry-head";

    const author = document.createElement("span");
    author.className = "progress-author";
    author.textContent = entry.authorId === currentUserId ? "You" : entry.authorEmail || "Deleted user";
    if (entry.authorId === currentProject?.ownerId) author.appendChild(badge("owner", "owner"));

    const date = document.createElement("span");
    date.className = "progress-date";
    date.textContent = progressDateFormatter.format(toUtcDate(entry.createdAt));

    head.append(author, date);

    const text = document.createElement("p");
    text.className = "progress-text";
    text.textContent = entry.text;

    item.append(head, text);
    list.appendChild(item);
  }

  return list;
}

function renderProgressForm(todo: Todo): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "progress-form";

  const textarea = document.createElement("textarea");
  textarea.placeholder = "Write a message…";
  textarea.maxLength = 2000;
  textarea.rows = 2;
  textarea.required = true;

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Send";

  form.onsubmit = (e) => {
    e.preventDefault();
    const text = textarea.value.trim();
    if (!text) return;
    textarea.value = "";
    void submitProgress(todo.id, text);
  };

  form.append(textarea, submit);
  return form;
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

  const deadline = document.createElement("label");
  deadline.className = "deadline-field";
  deadline.textContent = "Deadline";
  const dueDate = document.createElement("input");
  dueDate.type = "date";
  dueDate.required = true;
  dueDate.value = todoKey(todo);
  deadline.appendChild(dueDate);

  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save";

  const cancel = actionButton("Cancel", "secondary", () => {
    editing = null;
    render();
  });

  form.onsubmit = (e) => {
    e.preventDefault();
    if (!title.value.trim() || !dueDate.value) return;
    editing = null;
    if (dueDate.value !== todoKey(todo)) {
      const [year, month] = dueDate.value.split("-").map(Number);
      selectedKey = dueDate.value;
      viewYear = year;
      viewMonth = month - 1;
    }
    void runTodoAction(() =>
      updateTodo({
        ...todo,
        title: title.value.trim(),
        description: description.value.trim() || null,
        category: category.value.trim() || null,
        priority: Number(priority.value) as Priority,
        dueDate: `${dueDate.value}T00:00:00`,
      })
    );
  };

  form.append(title, description, category, priority, deadline, save, cancel);
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
