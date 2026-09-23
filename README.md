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

- **TodosController** — CRUD for tasks; enforces that a regular user only ever sees/edits/deletes their own tasks, while an `Admin` can act on any task
- **AuthController** — registration and login; issues JWTs
- **AdminController** — user management for admins: list users, list all tasks, ban/unban a user, delete a user
- **JwtService** — builds and signs the JWT issued on login/registration
- **AppDbContext** — `IdentityDbContext<AppUser>`, adds the `Todos` table

There is no separate service/repository layer at the moment — business rules (ownership checks, role checks) live directly in the controllers.

The TypeScript frontend calls the API via `fetch` and updates the DOM without reloading the page. It includes a task list with category filtering, a due-date calendar view, and an admin panel for managing users.

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
    string UserId;      // task owner
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
| User  | Sees and edits only their own tasks                                 |
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

## API endpoints

**Authentication**

| Method | Path                | Description                        | Access   |
|--------|---------------------|--------------------------------------|----------|
| POST   | /api/auth/register  | Register a new user (`User` role)  | Everyone |
| POST   | /api/auth/login     | Log in, receive a JWT token        | Everyone |

**Tasks** (`[Authorize]`)

| Method | Path             | Description                                                        | Access                    |
|--------|------------------|-----------------------------------------------------------------------|---------------------------|
| GET    | /api/todos       | Get own tasks (all tasks for Admin); optional `?category=` filter | User, Admin                |
| GET    | /api/todos/{id}  | Get a task by id                                                   | User (own), Admin (any)    |
| POST   | /api/todos       | Create a new task                                                  | User, Admin                 |
| PUT    | /api/todos/{id}  | Update a task                                                      | User (own), Admin (any)    |
| DELETE | /api/todos/{id}  | Delete a task                                                      | User (own), Admin (any)    |

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
│   │   ├── AuthController.cs
│   │   └── AdminController.cs
│   ├── Services/
│   │   ├── JwtService.cs
│   │   └── AppIdentityErrorDescriber.cs
│   ├── Models/
│   │   ├── TodoItem.cs         # + TodoCreateDto / TodoUpdateDto
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
│       ├── session.ts
│       └── main.ts
├── docker-compose.yml
└── README.md
```

## Running the project

The project is cross-platform: the .NET SDK, Node.js/TypeScript and Docker all work on macOS (including Apple Silicon — M1/M2/M3), Windows and Linux. Below are instructions for running without Docker (each part separately) and with Docker (the easiest way).

The database schema is created automatically at startup via `Database.EnsureCreated()` — there are no EF Core migrations to apply manually.

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
