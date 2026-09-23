import type { Project } from "./types.js";
import {
  ApiError,
  getProjects,
  createProject,
  deleteProject,
  addProjectMember,
  removeProjectMember,
} from "./api.js";
import { navigate, routes } from "./router.js";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const projectList = byId<HTMLUListElement>("project-list");

const createForm = byId<HTMLFormElement>("project-create-form");
const nameInput = byId<HTMLInputElement>("project-name");
const membersInput = byId<HTMLTextAreaElement>("project-members");
const createError = byId<HTMLElement>("project-create-error");

const panel = byId<HTMLElement>("project-panel");
const ownerLabel = byId<HTMLElement>("project-owner-label");
const memberList = byId<HTMLUListElement>("member-list");
const memberForm = byId<HTMLFormElement>("member-add-form");
const memberEmail = byId<HTMLInputElement>("member-email");
const panelError = byId<HTMLElement>("project-error");
const leaveBtn = byId<HTMLButtonElement>("project-leave-btn");
const deleteBtn = byId<HTMLButtonElement>("project-delete-btn");

let pendingPanelError = "";
let panelProject: Project | null = null;
let panelUserId: string | null = null;
let onPanelChange: (() => void) | null = null;

export function errorText(e: unknown): string {
  const details = e instanceof ApiError && e.details.length > 0 ? `: ${e.details.join("; ")}` : "";
  return `${(e as Error).message}${details}`;
}

export async function renderProjectList() {
  projectList.innerHTML = `<li class="empty">Loading...</li>`;
  let projects: Project[];
  try {
    projects = await getProjects();
  } catch (e) {
    projectList.innerHTML = "";
    const li = document.createElement("li");
    li.className = "error";
    li.textContent = errorText(e);
    projectList.appendChild(li);
    return;
  }

  projectList.innerHTML = "";
  if (projects.length === 0) {
    projectList.innerHTML = `<li class="empty">No projects yet. Create one or ask a project owner to add you.</li>`;
    return;
  }

  for (const p of projects) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.className = "project-card";
    link.href = routes.project(p.id);

    const head = document.createElement("div");
    head.className = "project-card-head";
    const name = document.createElement("span");
    name.className = "project-card-name";
    name.textContent = p.name;
    head.appendChild(name);
    if (p.isOwner) {
      const badge = document.createElement("span");
      badge.className = "badge owner";
      badge.textContent = "Owner";
      head.appendChild(badge);
    }

    const meta = document.createElement("div");
    meta.className = "muted";
    const members = p.members.length === 1 ? "1 member" : `${p.members.length} members`;
    meta.textContent = `${members} · ${p.openTaskCount} open of ${p.taskCount} tasks · owner ${p.ownerEmail}`;

    link.append(head, meta);
    li.appendChild(link);
    projectList.appendChild(li);
  }
}

export function resetCreateForm() {
  createForm.reset();
  createError.textContent = "";
}

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;

  const button = createForm.querySelector<HTMLButtonElement>("button[type=submit]")!;
  button.disabled = true;
  createError.textContent = "";

  try {
    const project = await createProject(name);
    const emails = [...new Set(membersInput.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
    const failed: string[] = [];
    for (const email of emails) {
      try {
        await addProjectMember(project.id, email);
      } catch (err) {
        failed.push(`${email} — ${errorText(err)}`);
      }
    }
    resetCreateForm();
    pendingPanelError = failed.length > 0 ? `Some members were not added: ${failed.join("; ")}` : "";
    navigate(routes.project(project.id));
  } catch (err) {
    createError.textContent = errorText(err);
  } finally {
    button.disabled = false;
  }
});

export function renderMembersPanel(project: Project, userId: string | null, onChange: () => void) {
  panelProject = project;
  panelUserId = userId;
  onPanelChange = onChange;

  panelError.textContent = pendingPanelError;
  if (pendingPanelError) panel.classList.remove("hidden");
  pendingPanelError = "";

  ownerLabel.textContent = `Owner: ${project.ownerEmail}`;
  memberForm.classList.toggle("hidden", !project.isOwner);
  deleteBtn.classList.toggle("hidden", !project.isOwner);
  leaveBtn.classList.toggle("hidden", project.isOwner);

  memberList.innerHTML = "";
  for (const m of project.members) {
    const li = document.createElement("li");
    const email = document.createElement("span");
    email.textContent = m.userId === userId ? `${m.email} (you)` : m.email;
    li.appendChild(email);

    if (m.isOwner) {
      const badge = document.createElement("span");
      badge.className = "badge owner";
      badge.textContent = "Owner";
      li.appendChild(badge);
    } else if (project.isOwner) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Remove";
      btn.onclick = () => void run(async () => {
        await removeProjectMember(project.id, m.userId);
        onChange();
      });
      li.appendChild(btn);
    }
    memberList.appendChild(li);
  }
}

export function hideMembersPanel() {
  panel.classList.add("hidden");
  panelError.textContent = "";
  memberForm.reset();
}

export function toggleMembersPanel() {
  panel.classList.toggle("hidden");
}

async function run(action: () => Promise<void>) {
  panelError.textContent = "";
  try {
    await action();
  } catch (e) {
    panelError.textContent = errorText(e);
    panel.classList.remove("hidden");
  }
}

memberForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const project = panelProject;
  const email = memberEmail.value.trim();
  if (!project || !email) return;
  void run(async () => {
    await addProjectMember(project.id, email);
    memberForm.reset();
    onPanelChange?.();
  });
});

leaveBtn.addEventListener("click", () => {
  const project = panelProject;
  if (!project || !panelUserId || !confirm(`Leave project "${project.name}"?`)) return;
  const userId = panelUserId;
  void run(async () => {
    await removeProjectMember(project.id, userId);
    navigate(routes.list);
  });
});

deleteBtn.addEventListener("click", () => {
  const project = panelProject;
  if (!project || !confirm(`Delete project "${project.name}" and all its tasks?`)) return;
  void run(async () => {
    await deleteProject(project.id);
    navigate(routes.list);
  });
});
