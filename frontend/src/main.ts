import { initAuth } from "./auth.js";
import { mountUsersPanel } from "./admin.js";
import { getProject } from "./api.js";
import { openBoard, closeBoard } from "./board.js";
import {
  renderProjectList,
  resetCreateForm,
  renderMembersPanel,
  hideMembersPanel,
  toggleMembersPanel,
  errorText,
} from "./projects.js";
import { parseRoute, routes, type Route } from "./router.js";
import { loadSession, saveSession, clearSession, type Session } from "./session.js";

const authSection = document.getElementById("auth-section")!;
const appSection = document.getElementById("app-section")!;
const userArea = document.getElementById("user-area")!;
const roleLabel = document.getElementById("role-label")!;
const logoutBtn = document.getElementById("logout-btn")!;

const pages = {
  list: document.getElementById("projects-page")!,
  create: document.getElementById("project-create-page")!,
  project: document.getElementById("project-page")!,
};

const projectTitle = document.getElementById("project-title")!;
const projectLoadError = document.getElementById("project-load-error")!;
const projectBody = document.getElementById("project-body")!;
const membersToggle = document.getElementById("project-members-btn")!;

let currentSession: Session | null = null;
let unmountAdmin: (() => void) | null = null;
let routeVersion = 0;

function showPage(page: keyof typeof pages | null) {
  for (const [name, el] of Object.entries(pages)) el.classList.toggle("hidden", name !== page);
}

async function handleRoute() {
  const session = currentSession;
  if (!session || session.isAdmin) return;

  const route: Route = parseRoute(location.hash);
  const version = ++routeVersion;

  if (route.page !== "project") {
    closeBoard();
    hideMembersPanel();
  }

  if (route.page === "list") {
    showPage("list");
    await renderProjectList();
    return;
  }

  if (route.page === "create") {
    resetCreateForm();
    showPage("create");
    document.getElementById("project-name")!.focus();
    return;
  }

  showPage("project");
  await loadProjectPage(route.id, session, version);
}

async function loadProjectPage(id: string, session: Session, version: number) {
  try {
    const project = await getProject(id);
    if (version !== routeVersion) return;

    projectLoadError.textContent = "";
    projectBody.classList.remove("hidden");
    projectTitle.textContent = project.name;
    renderMembersPanel(project, session.userId, () => void loadProjectPage(id, session, routeVersion));
    openBoard(project, session.userId);
  } catch (e) {
    if (version !== routeVersion) return;
    closeBoard();
    hideMembersPanel();
    projectTitle.textContent = "Project";
    projectBody.classList.add("hidden");
    projectLoadError.textContent = errorText(e);
  }
}

function showApp(session: Session) {
  currentSession = session;
  authSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  userArea.classList.remove("hidden");
  roleLabel.textContent = session.isAdmin ? "Administrator" : "User";

  unmountAdmin?.();
  unmountAdmin = null;

  if (session.isAdmin) {
    showPage(null);
    unmountAdmin = mountUsersPanel(appSection, session.userId);
    return;
  }

  if (!location.hash.startsWith("#/")) history.replaceState(null, "", routes.list);
  void handleRoute();
}

function showAuth() {
  currentSession = null;
  unmountAdmin?.();
  unmountAdmin = null;
  closeBoard();
  hideMembersPanel();
  showPage(null);
  appSection.classList.add("hidden");
  userArea.classList.add("hidden");
  authSection.classList.remove("hidden");
  resetAuth();
}

membersToggle.addEventListener("click", toggleMembersPanel);
window.addEventListener("hashchange", () => void handleRoute());

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
