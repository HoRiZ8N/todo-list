using Microsoft.EntityFrameworkCore;
using TodoApp.Backend.Data;
using TodoApp.Backend.Models;

namespace TodoApp.Backend.Services;

public class SubtaskService
{
    private const int MaxSubtaskCount = 50;

    private readonly AppDbContext _db;
    private readonly ICurrentUser _user;
    private readonly TodoPermissions _permissions;

    public SubtaskService(AppDbContext db, ICurrentUser user, TodoPermissions permissions)
    {
        _db = db;
        _user = user;
        _permissions = permissions;
    }

    public async Task<Result<SubtaskDto>> Add(Guid todoId, SubtaskCreateDto dto)
    {
        if (ValidateTitle(dto.Title) is { } error) return error;

        var todo = await _db.Todos.AsNoTracking().FirstOrDefaultAsync(t => t.Id == todoId);
        if (todo is null) return ServiceError.NotFound();
        if (!await _permissions.CanAccess(todo)) return ServiceError.Forbidden();
        if (!await _permissions.CanAddTo(todo.ProjectId))
            return ServiceError.Forbidden("Only the project owner can add subtasks");
        if (await _db.TodoSubtasks.CountAsync(s => s.TodoItemId == todoId) >= MaxSubtaskCount)
            return ServiceError.Invalid($"A task can have at most {MaxSubtaskCount} subtasks");

        var subtask = new TodoSubtask
        {
            TodoItemId = todoId,
            Title = dto.Title.Trim(),
            AuthorId = _user.Id
        };
        _db.TodoSubtasks.Add(subtask);
        await _db.SaveChangesAsync();

        return subtask.ToDto();
    }

    public async Task<Result<SubtaskDto>> Update(Guid todoId, Guid subtaskId, SubtaskUpdateDto dto)
    {
        if (ValidateTitle(dto.Title) is { } error) return error;

        var subtask = await Find(todoId, subtaskId);
        if (subtask is null) return ServiceError.NotFound();

        var todo = subtask.TodoItem!;
        var title = dto.Title.Trim();
        if (!await _permissions.CanAccess(todo)) return ServiceError.Forbidden();
        if (subtask.Title != title && !await _permissions.CanEdit(todo))
            return ServiceError.Forbidden("Only the project owner can rename subtasks");
        if (subtask.IsDone != dto.IsDone && !await _permissions.CanWorkOn(todo))
            return ServiceError.Forbidden("Only the assignee and the project owner can complete subtasks");

        subtask.Title = title;
        subtask.IsDone = dto.IsDone;
        await _db.SaveChangesAsync();

        return subtask.ToDto();
    }

    public async Task<Result> Delete(Guid todoId, Guid subtaskId)
    {
        var subtask = await Find(todoId, subtaskId);
        if (subtask is null) return ServiceError.NotFound();

        var todo = subtask.TodoItem!;
        if (!await _permissions.CanAccess(todo)) return ServiceError.Forbidden();
        if (subtask.AuthorId != _user.Id && !await _permissions.CanDelete(todo)) return ServiceError.Forbidden();

        _db.TodoSubtasks.Remove(subtask);
        await _db.SaveChangesAsync();
        return Result.Success;
    }

    private Task<TodoSubtask?> Find(Guid todoId, Guid subtaskId) =>
        _db.TodoSubtasks
            .Include(s => s.TodoItem)
            .FirstOrDefaultAsync(s => s.Id == subtaskId && s.TodoItemId == todoId);

    private static ServiceError? ValidateTitle(string? title)
    {
        var trimmed = title?.Trim() ?? "";
        return trimmed.Length == 0 || trimmed.Length > TodoService.MaxTitleLength
            ? ServiceError.Invalid($"Subtask title must be 1-{TodoService.MaxTitleLength} characters long")
            : null;
    }
}
