using Microsoft.EntityFrameworkCore;
using TodoApp.Backend.Data;
using TodoApp.Backend.Models;

namespace TodoApp.Backend.Services;

public class TodoService
{
    public const int MaxTitleLength = 200;
    private const int MaxDescriptionLength = 4000;

    private readonly AppDbContext _db;
    private readonly ICurrentUser _user;
    private readonly TodoPermissions _permissions;

    public TodoService(AppDbContext db, ICurrentUser user, TodoPermissions permissions)
    {
        _db = db;
        _user = user;
        _permissions = permissions;
    }

    public async Task<Result<List<TodoDto>>> GetAll(Guid? projectId, string? category)
    {
        IQueryable<TodoItem> query;

        if (projectId is { } pid)
        {
            if (!await _permissions.CanAccessProject(pid)) return ServiceError.Forbidden();
            query = _db.Todos.Where(t => t.ProjectId == pid);
        }
        else
        {
            query = _db.Todos.Where(t => t.ProjectId == null && t.UserId == _user.Id);
        }

        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(t => t.Category == category);

        return await _db.SelectTodoDtos(query
                .OrderByDescending(t => t.Priority)
                .ThenByDescending(t => t.CreatedAt))
            .ToListAsync();
    }

    public async Task<Result<TodoDto>> GetById(Guid id)
    {
        var todo = await FindReadOnly(id);
        if (todo is null) return ServiceError.NotFound();
        if (!await _permissions.CanAccess(todo)) return ServiceError.Forbidden();
        return await Load(id);
    }

    public async Task<Result<TodoDto>> Create(TodoCreateDto dto)
    {
        if (Validate(dto.Title, dto.Description) is { } error) return error;
        if (!await _permissions.CanAddTo(dto.ProjectId))
            return ServiceError.Forbidden("Only the project owner can add tasks");

        var todo = new TodoItem
        {
            Title = dto.Title.Trim(),
            Description = Normalize(dto.Description),
            DueDate = dto.DueDate,
            Category = dto.Category,
            Priority = dto.Priority,
            UserId = _user.Id,
            ProjectId = dto.ProjectId
        };
        _db.Todos.Add(todo);
        await _db.SaveChangesAsync();

        return await Load(todo.Id);
    }

    public async Task<Result<TodoDto>> Update(Guid id, TodoUpdateDto dto)
    {
        if (Validate(dto.Title, dto.Description) is { } error) return error;

        var todo = await _db.Todos.FindAsync(id);
        if (todo is null) return ServiceError.NotFound();
        if (!await _permissions.CanAccess(todo)) return ServiceError.Forbidden();
        if (!await _permissions.CanEdit(todo))
            return ServiceError.Forbidden("Only the project owner can edit tasks");

        todo.Title = dto.Title.Trim();
        todo.Description = Normalize(dto.Description);
        todo.IsDone = dto.IsDone;
        todo.DueDate = dto.DueDate;
        todo.Category = dto.Category;
        todo.Priority = dto.Priority;
        await _db.SaveChangesAsync();

        return await Load(id);
    }

    public async Task<Result> Delete(Guid id)
    {
        var todo = await _db.Todos.FindAsync(id);
        if (todo is null) return ServiceError.NotFound();
        if (!await _permissions.CanDelete(todo)) return ServiceError.Forbidden();

        _db.Todos.Remove(todo);
        await _db.SaveChangesAsync();
        return Result.Success;
    }

    public async Task<Result<TodoDto>> Claim(Guid id)
    {
        var todo = await FindReadOnly(id);
        if (todo is null) return ServiceError.NotFound();
        if (!await _permissions.CanAccess(todo)) return ServiceError.Forbidden();
        if (todo.ProjectId is null) return ServiceError.Invalid("Only project tasks can be taken");
        if (todo.IsDone) return ServiceError.Invalid("Task is already done");

        var me = _user.Id;
        var updated = await _db.Todos
            .Where(t => t.Id == id && (t.AssigneeId == null || t.AssigneeId == me))
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.AssigneeId, me));

        var result = await Load(id);
        if (updated == 0) return ServiceError.Conflict($"Task is already taken by {result.AssigneeEmail}");
        return result;
    }

    public async Task<Result<TodoDto>> Release(Guid id)
    {
        var todo = await FindReadOnly(id);
        if (todo is null) return ServiceError.NotFound();
        if (!await _permissions.CanAccess(todo)) return ServiceError.Forbidden();
        if (!await _permissions.CanRelease(todo)) return ServiceError.Forbidden();

        await _db.Todos
            .Where(t => t.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.AssigneeId, (string?)null));

        return await Load(id);
    }

    private Task<TodoItem?> FindReadOnly(Guid id) =>
        _db.Todos.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);

    private Task<TodoDto> Load(Guid id) =>
        _db.SelectTodoDtos(_db.Todos.Where(t => t.Id == id)).FirstAsync();

    private static ServiceError? Validate(string? title, string? description)
    {
        var trimmed = title?.Trim() ?? "";
        if (trimmed.Length == 0 || trimmed.Length > MaxTitleLength)
            return ServiceError.Invalid($"Title must be 1-{MaxTitleLength} characters long");
        if (description?.Length > MaxDescriptionLength)
            return ServiceError.Invalid($"Description must be at most {MaxDescriptionLength} characters long");
        return null;
    }

    private static string? Normalize(string? description) =>
        string.IsNullOrWhiteSpace(description) ? null : description.Trim();
}
