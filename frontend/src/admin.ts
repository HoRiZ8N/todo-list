import type { AdminUser } from "./types.js";
import { getUsers, banUser, unbanUser } from "./api.js";

function createTab(label: string, active: boolean): HTMLButtonElement {
  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = active ? "tab active" : "tab";
  tab.textContent = label;
  return tab;
}

export function mountAdminPanel(todosTab: HTMLElement, currentUserId: string | null): () => void {
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  const tabTodos = createTab("Tasks", true);
  const tabUsers = createTab("Users", false);
  tabs.append(tabTodos, tabUsers);

  const usersTab = document.createElement("div");
  usersTab.className = "hidden";
  usersTab.innerHTML = `
    <table>
      <thead><tr><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
      <tbody></tbody>
    </table>`;
  const tbody = usersTab.querySelector("tbody")!;

  todosTab.before(tabs);
  todosTab.after(usersTab);

  function switchTab(showUsers: boolean) {
    tabTodos.classList.toggle("active", !showUsers);
    tabUsers.classList.toggle("active", showUsers);
    todosTab.classList.toggle("hidden", showUsers);
    usersTab.classList.toggle("hidden", !showUsers);
    if (showUsers) void loadUsers();
  }

  async function loadUsers() {
    tbody.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;
    try {
      renderUsers(await getUsers());
    } catch (e) {
      tbody.innerHTML = "";
      const tr = tbody.insertRow();
      const td = tr.insertCell();
      td.colSpan = 4;
      td.className = "error";
      td.textContent = (e as Error).message;
    }
  }

  function renderUsers(users: AdminUser[]) {
    tbody.innerHTML = "";
    for (const u of users) {
      const tr = tbody.insertRow();
      tr.insertCell().textContent = u.email;
      tr.insertCell().textContent = u.role === "Admin" ? "Administrator" : "User";

      const statusTd = tr.insertCell();
      statusTd.textContent = u.isBanned ? "Banned" : "Active";
      statusTd.className = u.isBanned ? "status-banned" : "status-active";

      const actionTd = tr.insertCell();
      if (u.id === currentUserId) {
        actionTd.textContent = "— you";
        continue;
      }

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
    }
  }

  tabTodos.onclick = () => switchTab(false);
  tabUsers.onclick = () => switchTab(true);

  return () => {
    tabs.remove();
    usersTab.remove();
    todosTab.classList.remove("hidden");
  };
}
