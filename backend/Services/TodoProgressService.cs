using Microsoft.EntityFrameworkCore;
using TodoApp.Backend.Data;
using TodoApp.Backend.Models;

namespace TodoApp.Backend.Services;

public class TodoProgressService
{
    private const int MaxTextLength = 2000;

    private readonly AppDbContext _db;
    private readonly ICurrentUser _user;
    private readonly TodoPermissions _permissions;

    public TodoProgressService(AppDbContext db, ICurrentUser user, TodoPermissions permissions)
    {
        _db = db;
        _user = user;
        _permissions = permissions;
    }

    public async Task<Result<List<TodoProgressDto>>> GetAll(Guid todoId)
    {
        var todo = await FindTodo(todoId);
        if (todo is null) return ServiceError.NotFound();
        if (!await _permissions.CanAccess(todo)) return ServiceError.Forbidden();

        return await _db.SelectProgressDtos(_db.TodoProgressEntries
                .Where(p => p.TodoItemId == todoId)
                .OrderBy(p => p.CreatedAt))
            .ToListAsync();
    }

    public async Task<Result<TodoProgressDto>> Add(Guid todoId, TodoProgressCreateDto dto)
    {
        var text = dto.Text?.Trim() ?? "";
        if (text.Length == 0 || text.Length > MaxTextLength)
            return ServiceError.Invalid($"Message must be 1-{MaxTextLength} characters long");

        var todo = await FindTodo(todoId);
        if (todo is null) return ServiceError.NotFound();
        if (!await _permissions.CanAccess(todo)) return ServiceError.Forbidden();
        if (!await _permissions.CanWorkOn(todo))
            return ServiceError.Forbidden("Only the assignee and the project owner can write in the discussion");

        var entry = new TodoProgressEntry
        {
            TodoItemId = todoId,
            AuthorId = _user.Id,
            Text = text
        };
        _db.TodoProgressEntries.Add(entry);
        await _db.SaveChangesAsync();

        return await _db.SelectProgressDtos(_db.TodoProgressEntries.Where(p => p.Id == entry.Id)).FirstAsync();
    }

    private Task<TodoItem?> FindTodo(Guid id) =>
        _db.Todos.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
}
