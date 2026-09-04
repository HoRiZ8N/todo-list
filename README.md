# Todo List App

Простое веб-приложение для управления списком задач. Backend на C# (ASP.NET Core), frontend на HTML, CSS и TypeScript.

## Стек технологий

**Backend**
- C# / ASP.NET Core Web API
- Entity Framework Core (ORM)
- SQLite (база данных)
- ASP.NET Core Identity (пользователи, роли)
- JWT (авторизация по токену)

**Frontend**
- HTML5
- CSS3
- TypeScript

**Инфраструктура**
- Docker / Docker Compose

## Архитектура

Backend построен по слоистой архитектуре:

```
TodosController → TodoService → ITodoRepository → AppDbContext → БД
```

- **TodosController** — принимает HTTP-запросы, отдаёт ответы (REST API)
- **TodoService** — бизнес-логика (создание, валидация, отметка выполнения)
- **ITodoRepository / TodoRepository** — доступ к данным
- **AppDbContext** — контекст EF Core, работа с БД

Frontend на TypeScript обращается к API через `fetch` и обновляет DOM без перезагрузки страницы.

## Модель данных

```csharp
class TodoItem
{
    Guid Id;
    string Title;
    string? Description;
    bool IsDone;
    DateTime CreatedAt;
    DateTime? DueDate;
    string UserId;      // владелец задачи
}

class AppUser : IdentityUser
{
    // email, username, password наследуются от IdentityUser
}
```

Роли: `User` и `Admin` (хранятся через `IdentityRole`, назначаются пользователю при регистрации/через админа).

## Роли и авторизация

| Роль  | Права                                                         |
|-------|----------------------------------------------------------------|
| User  | Видит и редактирует только свои задачи                        |
| Admin | Видит все задачи всех пользователей, может управлять юзерами  |

Авторизация реализована через JWT: после логина клиент получает токен, в котором зашита роль (`ClaimTypes.Role`). Токен передаётся в заголовке `Authorization: Bearer <token>` при каждом запросе.

Эндпоинты защищаются атрибутами:

```csharp
[Authorize] // любой авторизованный пользователь
[Authorize(Roles = "Admin")] // только администратор
```

## API эндпоинты

**Авторизация**

| Метод  | Путь                 | Описание                          | Доступ      |
|--------|----------------------|------------------------------------|-------------|
| POST   | /api/auth/register   | Регистрация нового пользователя    | Все         |
| POST   | /api/auth/login      | Вход, получение JWT-токена         | Все         |

**Задачи**

| Метод  | Путь               | Описание                          | Доступ                  |
|--------|--------------------|-------------------------------------|--------------------------|
| GET    | /api/todos         | Получить свои задачи               | User, Admin              |
| GET    | /api/todos/{id}    | Получить задачу по id              | User (свою), Admin (любую) |
| POST   | /api/todos         | Создать новую задачу               | User, Admin               |
| PUT    | /api/todos/{id}    | Обновить задачу                     | User (свою), Admin (любую) |
| DELETE | /api/todos/{id}    | Удалить задачу                      | User (свою), Admin (любую) |

**Администрирование**

| Метод  | Путь               | Описание                          | Доступ |
|--------|--------------------|-------------------------------------|--------|
| GET    | /api/admin/users   | Список всех пользователей           | Admin  |
| GET    | /api/admin/todos   | Все задачи всех пользователей       | Admin  |
| DELETE | /api/admin/users/{id} | Удалить пользователя             | Admin  |

## Структура проекта

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

## Запуск проекта

Проект кроссплатформенный: и .NET SDK, и Node.js/TypeScript, и Docker нормально работают на macOS (включая Apple Silicon — M1/M2/M3), Windows и Linux. Ниже — запуск без Docker (по отдельности) и через Docker (проще всего).

### Backend

```bash
cd backend
dotnet restore
dotnet ef database update
dotnet run
```

API будет доступен по адресу `https://localhost:5001` (или порт из `launchSettings.json`).

### Frontend

```bash
cd frontend
npm install
npx tsc --watch
```

Открыть `index.html` в браузере или запустить через любой статический сервер (например, `live-server`).

> Убедитесь, что в `frontend/src/api.ts` указан правильный адрес backend API.

### Через Docker

Проще всего поднять весь проект (backend + frontend) одной командой:

```bash
docker compose up --build
```

Backend будет доступен на `http://localhost:5001`, frontend — на `http://localhost:8080`.

Пример `docker-compose.yml`:

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

Пример `backend/Dockerfile`:

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

Пример `frontend/Dockerfile` (сборка TS + отдача статики через nginx):

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

1. Планирование — требования, модели данных
2. База данных — схема, EF Core, миграции
3. Backend (C#) — ASP.NET Core, REST API
4. Авторизация и роли — Identity, JWT, User/Admin
5. Frontend (HTML/CSS/TS) — разметка, стили, логика
6. Интеграция — fetch API, CRUD-запросы
7. Тесты и деплой — проверка, публикация

## Лицензия

MIT
