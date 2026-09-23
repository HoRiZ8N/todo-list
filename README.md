# Todo List App

A simple web application for managing a task list. Backend in C# (ASP.NET Core), frontend in HTML, CSS and TypeScript.

## Tech stack

**Backend**
- C# / ASP.NET Core Web API (.NET 8)
- Entity Framework Core (ORM)
- SQLite (database)
- ASP.NET Core Identity (users, roles)
- JWT (token-based authentication)
- Swagger / OpenAPI (in the Development environment)

**Frontend**
- HTML5
- CSS3
- TypeScript (compiled with `tsc`, no framework/bundler)

**Infrastructure**
- Docker / Docker Compose

## Architecture

The backend is currently a thin layered API: controllers talk to EF Core directly through `AppDbContext`.

```
TodosController  → AppDbContext → SQLite
AuthController   → UserManager<AppUser> (ASP.NET Core Identity) → AppDbContext
AdminController  → UserManager<AppUser> / AppDbContext
```

- **ProjectsController** — team projects: create/rename/delete a project, add/remove members (owner only), leave a project (member)
- **TodosController** — CRUD for tasks; personal tasks are visible only to their author, project tasks to every project member
- **AuthController** — registration and login; issues JWTs
- **AdminController** — user management for admins: list users, list all tasks, ban/unban a user, delete a user
- **JwtService** — builds and signs the JWT issued on login/registration
- **AppDbContext** — `IdentityDbContext<AppUser>`, adds the `Todos`, `Projects` and `ProjectMembers` tables

There is no separate service/repository layer at the moment — business rules (ownership checks, role checks) live directly in the controllers.

The TypeScript frontend calls the API via `fetch` and updates the DOM without reloading the page. Navigation uses hash routes:

| Route                 | Page                                                              |
|-----------------------|-------------------------------------------------------------------|
| `#/`                  | Project list (projects the user owns or belongs to)               |
| `#/projects/new`      | Project creation (name + optional member emails)                  |
| `#/projects/{id}`     | Project page: members panel; calendar with the selected day's tasks on the left, all project tasks (filter: open / taken by me / free to take / done / all) on the right |

Admins see only the users management panel.

## Data model

```csharp
public enum TodoPriority { Low = 0, Medium = 1, High = 2 }

class TodoItem
{
    Guid Id;
    string Title;
    string? Description;
    bool IsDone;
    DateTime CreatedAt;
    DateTime? DueDate;
    string? Category;
    TodoPriority Priority;
    string UserId;      // task author
    Guid? ProjectId;    // null = personal task
    string? AssigneeId; // user who took the task
    List<TodoSubtask> Subtasks;
}

class TodoSubtask
{
    Guid Id;
    Guid TodoItemId;    // parent task, cascade delete
    string Title;
    bool IsDone;
    string AuthorId;
    DateTime CreatedAt;
}

class Project
{
    Guid Id;
    string Name;
    DateTime CreatedAt;
    string OwnerId;
    List<ProjectMember> Members;
}

class ProjectMember     // PK (ProjectId, UserId)
{
    Guid ProjectId;
    string UserId;
    DateTime AddedAt;
}

class AppUser : IdentityUser
{
    bool IsBanned;
}
```

Roles: `User` and `Admin`, stored via ASP.NET Core Identity's `IdentityRole`.

## Roles and authorization

| Role  | Permissions                                                       |
|-------|---------------------------------------------------------------------|
| User  | Sees and edits own personal tasks and tasks of projects they own or belong to |
| Admin | Sees all tasks of all users; can list, ban/unban and delete users   |

Authorization uses JWT: after logging in, the client receives a token containing the user's id and role (`ClaimTypes.Role`). The token is sent in the `Authorization: Bearer <token>` header with every request.

Endpoints are protected with attributes:

```csharp
[Authorize]                    // any authenticated user
[Authorize(Roles = "Admin")]   // administrators only
```

Notes on roles and access:
- Every newly registered account gets the `User` role automatically; there is currently no in-app action to promote a user to `Admin`.
- An `Admin` account is provisioned on startup from the `Admin:Email` / `Admin:Password` configuration (see [Running the project](#running-the-project)) — if it doesn't exist yet, it's created and given the `Admin` role.
- A banned user (`IsBanned = true`) cannot log in (`403` on `POST /api/auth/login`) and, if they already hold a valid token, every subsequent authenticated request is rejected with `403` by a global middleware check.

## Projects and team access

| Action                                   | Project owner | Project member |
|------------------------------------------|---------------|----------------|
| View project, members and tasks          | ✓             | ✓              |
| Create tasks                             | ✓             | —              |
| Edit / complete tasks                    | ✓             | —              |
| Delete a task                            | any task      | own tasks only |
| Rename / delete project                  | ✓             | —              |
| Add / remove members                     | ✓             | —              |
| Leave project                            | —             | ✓              |
| Take a free task                         | ✓             | ✓              |
| Release a taken task                     | any task      | own only       |
| Add subtasks                             | ✓             | —              |
| Rename subtasks                          | ✓             | —              |
| Check off subtasks                       | ✓             | assignee only  |
| Write in a task discussion               | ✓             | assignee only  |
| Delete a subtask                         | any subtask   | own subtasks, or any on own tasks |

Members are added by email. Deleting a project deletes all its tasks. A task can be taken by one member at a time; taking is atomic, so a concurrent attempt gets `409 Conflict`. Removing a member from a project releases the tasks they had taken.

## API endpoints

**Authentication**

| Method | Path                | Description                        | Access   |
|--------|---------------------|--------------------------------------|----------|
| POST   | /api/auth/register  | Register a new user (`User` role)  | Everyone |
| POST   | /api/auth/login     | Log in, receive a JWT token        | Everyone |

**Tasks** (`[Authorize]`)

| Method | Path             | Description                                                        | Access                    |
|--------|------------------|-----------------------------------------------------------------------|---------------------------|
| GET    | /api/todos       | Personal tasks, or project tasks with `?projectId=`; optional `?category=` | User, Admin |
| GET    | /api/todos/{id}  | Get a task by id                                                   | User (own), Admin (any)    |
| POST   | /api/todos       | Create a new task (project tasks: owner only)                      | User, Admin                 |
| PUT    | /api/todos/{id}  | Update a task                                                      | Personal: author; project: owner; Admin |
| DELETE | /api/todos/{id}  | Delete a task                                                      | User (own), Admin (any)    |
| POST   | /api/todos/{id}/claim   | Take a task (`409` if taken by someone else)                | Project member             |
| POST   | /api/todos/{id}/release | Release a task                                              | Assignee, project owner    |
| POST   | /api/todos/{id}/subtasks              | Add a subtask `{ "title" }` (max 50 per task)  | Project owner (personal task: its author) |
| PUT    | /api/todos/{id}/subtasks/{subtaskId}  | Rename / check off `{ "title", "isDone" }`     | Rename: project owner; check off: assignee, project owner |
| DELETE | /api/todos/{id}/subtasks/{subtaskId}  | Delete a subtask                               | Subtask author, task author, project owner |
| GET    | /api/todos/{id}/progress              | Task discussion messages                       | Anyone with access to the task |
| POST   | /api/todos/{id}/progress              | Post a message `{ "text" }`                    | Assignee, project owner |

Subtasks are returned inline in every `TodoDto` (`subtasks` array, ordered by creation time).

**Projects** (`[Authorize]`)

| Method | Path                                   | Description                         | Access                   |
|--------|----------------------------------------|-------------------------------------|--------------------------|
| GET    | /api/projects                          | Projects the user owns or belongs to | User                    |
| GET    | /api/projects/{id}                     | Project with members                | Owner, member            |
| POST   | /api/projects                          | Create a project                    | User                     |
| PUT    | /api/projects/{id}                     | Rename a project                    | Owner                    |
| DELETE | /api/projects/{id}                     | Delete a project and its tasks      | Owner                    |
| POST   | /api/projects/{id}/members             | Add a member by `{ "email" }`       | Owner                    |
| DELETE | /api/projects/{id}/members/{userId}    | Remove a member / leave a project   | Owner, the member itself |

**Administration** (`[Authorize(Roles = "Admin")]`)

| Method | Path                          | Description             | Access |
|--------|-------------------------------|--------------------------|--------|
| GET    | /api/admin/users              | List all users          | Admin  |
| GET    | /api/admin/todos              | All tasks of all users  | Admin  |
| POST   | /api/admin/users/{id}/ban     | Ban a user               | Admin  |
| POST   | /api/admin/users/{id}/unban   | Unban a user             | Admin  |
| DELETE | /api/admin/users/{id}         | Delete a user            | Admin  |

An admin cannot ban, unban or delete their own account (`BadRequest` is returned).

## Project structure

```
todo-list/
├── backend/
│   ├── Controllers/
│   │   ├── TodosController.cs
│   │   ├── ProjectsController.cs
│   │   ├── AuthController.cs
│   │   └── AdminController.cs
│   ├── Services/
│   │   ├── JwtService.cs
│   │   └── AppIdentityErrorDescriber.cs
│   ├── Models/
│   │   ├── TodoItem.cs         # + TodoCreateDto / TodoUpdateDto / TodoDto
│   │   ├── Project.cs          # + ProjectMember and project DTOs
│   │   └── AppUser.cs          # + Roles, RegisterDto, LoginDto, AuthResponseDto, ErrorResponseDto, AdminUserDto
│   ├── Data/
│   │   └── AppDbContext.cs
│   ├── Dockerfile
│   ├── appsettings.json
│   └── Program.cs
├── frontend/
│   ├── index.html
│   ├── Dockerfile
│   ├── styles/
│   │   └── style.css
│   └── src/
│       ├── types.ts
│       ├── api.ts
│       ├── auth.ts
│       ├── admin.ts
│       ├── router.ts
│       ├── projects.ts
│       ├── board.ts
│       ├── session.ts
│       └── main.ts
├── docker-compose.yml
└── README.md
```

## Running the project

The project is cross-platform: the .NET SDK, Node.js/TypeScript and Docker all work on macOS (including Apple Silicon — M1/M2/M3), Windows and Linux. Below are instructions for running without Docker (each part separately) and with Docker (the easiest way).

The database schema is created automatically at startup via `Database.EnsureCreated()` — there are no EF Core migrations to apply manually. `EnsureCreated()` does not update an existing database, so after schema changes the database has to be recreated (`docker compose down -v`).

### Backend

```bash
cd backend
dotnet restore
dotnet run
```

The API will be available at `https://localhost:5001` (or the port from `launchSettings.json`); a Swagger UI is available in the Development environment.

To have an admin account created automatically on startup, set `Admin:Email` and `Admin:Password` (e.g. via `dotnet user-secrets`, environment variables, or `appsettings.Development.json`) before running.

### Frontend

```bash
cd frontend
npm install
npm run watch   # or: npx tsc --watch
```

Open `index.html` in a browser or serve it with any static server (e.g. `live-server`).

> Make sure `frontend/src/api.ts` (`API_BASE`) points to the correct backend API address.

### With Docker

The easiest way to start the whole project (backend + frontend) is a single command:

```bash
docker compose up --build
```

The backend will be available at `http://localhost:5001`, the frontend at `http://localhost:8080`.

`docker-compose.yml` also provisions a default admin account on first run via `Admin__Email` / `Admin__Password`, and persists the SQLite file in a named volume (`todo-data`) so data survives container restarts.

## Roadmap

1. ~~Planning — requirements, data models~~
2. ~~Database — schema, EF Core, SQLite~~
3. ~~Backend (C#) — ASP.NET Core, REST API~~
4. ~~Authentication and roles — Identity, JWT, User/Admin~~
5. ~~Frontend (HTML/CSS/TS) — markup, styles, logic~~
6. ~~Integration — fetch API, CRUD requests~~
7. Service/repository layer — extract business logic out of the controllers
8. EF Core migrations — replace `EnsureCreated()` with versioned migrations
9. Testing and deployment — verification, publishing

## License

MIT
