import type { AdminUser } from "./types.js";
import { getUsers, banUser, unbanUser } from "./api.js";

export function mountUsersPanel(container: HTMLElement, currentUserId: string | null): () => void {
  const panel = document.createElement("div");
  panel.innerHTML = `
    <h2 class="panel-title">Users</h2>
    <table>
      <thead><tr><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
      <tbody></tbody>
    </table>`;
  const tbody = panel.querySelector("tbody")!;
  container.appendChild(panel);

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

  void loadUsers();

  return () => panel.remove();
}
