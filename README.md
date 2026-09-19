# Todo List App

A simple web application for managing a task list. Backend in C# (ASP.NET Core), frontend in HTML, CSS and TypeScript.

## Tech stack

**Backend**
- C# / ASP.NET Core Web API
- Entity Framework Core (ORM)
- SQLite (database)
- ASP.NET Core Identity (users, roles)
- JWT (token-based authentication)

**Frontend**
- HTML5
- CSS3
- TypeScript

**Infrastructure**
- Docker / Docker Compose

## Architecture

The backend follows a layered architecture:

```
TodosController → TodoService → ITodoRepository → AppDbContext → DB
```

- **TodosController** — handles HTTP requests and returns responses (REST API)
- **TodoService** — business logic (creation, validation, marking as done)
- **ITodoRepository / TodoRepository** — data access
- **AppDbContext** — EF Core context, database access

The TypeScript frontend calls the API via `fetch` and updates the DOM without reloading the page.

## Data model

```csharp
class TodoItem
{
    Guid Id;
    string Title;
    string? Description;
    bool IsDone;
    DateTime CreatedAt;
    DateTime? DueDate;
    string UserId;      // task owner
}

class AppUser : IdentityUser
{
    // email, username, password are inherited from IdentityUser
}
```

Roles: `User` and `Admin` (stored via `IdentityRole`, assigned on sign up or by an admin).

## Roles and authorization

| Role  | Permissions                                             |
|-------|----------------------------------------------------------------|
| User  | Sees and edits only their own tasks                     |
| Admin | Sees all tasks of all users, can manage users           |

Authorization uses JWT: after logging in, the client receives a token containing the role (`ClaimTypes.Role`). The token is sent in the `Authorization: Bearer <token>` header with every request.

Endpoints are protected with attributes:

```csharp
[Authorize] // any authenticated user
[Authorize(Roles = "Admin")] // administrators only
```

## API endpoints

**Authentication**

| Method | Path                 | Description                       | Access      |
|--------|----------------------|------------------------------------|-------------|
| POST   | /api/auth/register   | Register a new user               | Everyone    |
| POST   | /api/auth/login      | Log in, receive a JWT token       | Everyone    |

**Tasks**

| Method | Path               | Description                       | Access                     |
|--------|--------------------|-------------------------------------|--------------------------|
| GET    | /api/todos         | Get own tasks                     | User, Admin                |
| GET    | /api/todos/{id}    | Get a task by id                  | User (own), Admin (any)    |
| POST   | /api/todos         | Create a new task                 | User, Admin                |
| PUT    | /api/todos/{id}    | Update a task                     | User (own), Admin (any)    |
| DELETE | /api/todos/{id}    | Delete a task                     | User (own), Admin (any)    |

**Administration**

| Method | Path               | Description                       | Access |
|--------|--------------------|-------------------------------------|--------|
| GET    | /api/admin/users   | List all users                    | Admin  |
| GET    | /api/admin/todos   | All tasks of all users            | Admin  |
| DELETE | /api/admin/users/{id} | Delete a user                  | Admin  |

## Project structure

```
todo-app/
├── backend/
│   ├── Controllers/
│   │   ├── TodosController.cs
│   │   ├── AuthController.cs
│   │   └── AdminController.cs
│   ├── Services/
│   │   ├── TodoService.cs
│   │   └── AuthService.cs
│   ├── Repositories/
│   │   ├── ITodoRepository.cs
│   │   └── TodoRepository.cs
│   ├── Models/
│   │   ├── TodoItem.cs
│   │   └── AppUser.cs
│   ├── Data/
│   │   └── AppDbContext.cs
│   ├── Dockerfile
│   └── Program.cs
├── frontend/
│   ├── index.html
│   ├── Dockerfile
│   ├── styles/
│   │   └── style.css
│   └── src/
│       ├── types.ts
│       ├── api.ts
│       └── main.ts
├── docker-compose.yml
└── README.md
```

## Running the project

The project is cross-platform: the .NET SDK, Node.js/TypeScript and Docker all work on macOS (including Apple Silicon — M1/M2/M3), Windows and Linux. Below are instructions for running without Docker (each part separately) and with Docker (the easiest way).

### Backend

```bash
cd backend
dotnet restore
dotnet ef database update
dotnet run
```

The API will be available at `https://localhost:5001` (or the port from `launchSettings.json`).

### Frontend

```bash
cd frontend
npm install
npx tsc --watch
```

Open `index.html` in a browser or serve it with any static server (e.g. `live-server`).

> Make sure `frontend/src/api.ts` points to the correct backend API address.

### With Docker

The easiest way to start the whole project (backend + frontend) is a single command:

```bash
docker compose up --build
```

The backend will be available at `http://localhost:5001`, the frontend at `http://localhost:8080`.

Example `docker-compose.yml`:

```yaml
services:
  backend:
    build: ./backend
    ports:
      - "5001:8080"
    environment:
      - ASPNETCORE_ENVIRONMENT=Development
      - ConnectionStrings__Default=Data Source=/data/todo.db
    volumes:
      - todo-data:/data

  frontend:
    build: ./frontend
    ports:
      - "8080:80"
    depends_on:
      - backend

volumes:
  todo-data:
```

Example `backend/Dockerfile`:

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080
ENTRYPOINT ["dotnet", "TodoApp.Backend.dll"]
```

Example `frontend/Dockerfile` (TS build + serving static files via nginx):

```dockerfile
FROM node:20 AS build
WORKDIR /src
COPY . .
RUN npm install && npx tsc

FROM nginx:alpine
COPY --from=build /src /usr/share/nginx/html
EXPOSE 80
```

## Roadmap

1. Planning — requirements, data models
2. Database — schema, EF Core, migrations
3. Backend (C#) — ASP.NET Core, REST API
4. Authentication and roles — Identity, JWT, User/Admin
5. Frontend (HTML/CSS/TS) — markup, styles, logic
6. Integration — fetch API, CRUD requests
7. Testing and deployment — verification, publishing

## License

MIT
