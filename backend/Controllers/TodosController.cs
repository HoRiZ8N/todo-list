using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApp.Backend.Data;
using TodoApp.Backend.Models;

namespace TodoApp.Backend.Controllers;

[ApiController]
[Route("api/todos")]
[Authorize]
public class TodosController : ControllerBase
{
    private const int MaxTitleLength = 200;
    private const int MaxDescriptionLength = 4000;
    private const int MaxProgressTextLength = 2000;
    private const int MaxSubtaskCount = 50;

    private readonly AppDbContext _db;

    public TodosController(AppDbContext db)
    {
        _db = db;
    }

    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!;

    private bool IsAdmin => User.IsInRole(Roles.Admin);

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? projectId = null, [FromQuery] string? category = null)
    {
        IQueryable<TodoItem> query;

        if (projectId is { } pid)
        {
            if (!IsAdmin && !await _db.ProjectsAccessibleBy(CurrentUserId).AnyAsync(p => p.Id == pid))
                return Forbid();
            query = _db.Todos.Where(t => t.ProjectId == pid);
        }
        else
        {
            query = _db.Todos.Where(t => t.ProjectId == null && t.UserId == CurrentUserId);
        }

        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(t => t.Category == category);

        return Ok(await ToDto(query
            .OrderByDescending(t => t.Priority)
            .ThenByDescending(t => t.CreatedAt))
            .ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var todo = await _db.Todos.FindAsync(id);
        if (todo is null) return NotFound();
        if (!await CanAccess(todo)) return Forbid();
        return Ok(await ToDto(_db.Todos.Where(t => t.Id == id)).FirstAsync());
    }

    [HttpPost]
    public async Task<IActionResult> Create(TodoCreateDto dto)
    {
        var error = Validate(dto.Title, dto.Description);
        if (error is not null) return BadRequest(error);

        if (!await CanAddTo(dto.ProjectId))
            return StatusCode(StatusCodes.Status403Forbidden, "Only the project owner can add tasks");

        var todo = new TodoItem
        {
            Title = dto.Title.Trim(),
            Description = Normalize(dto.Description),
            DueDate = dto.DueDate,
            Category = dto.Category,
            Priority = dto.Priority,
            UserId = CurrentUserId,
            ProjectId = dto.ProjectId
        };
        _db.Todos.Add(todo);
        await _db.SaveChangesAsync();

        var result = await ToDto(_db.Todos.Where(t => t.Id == todo.Id)).FirstAsync();
        return CreatedAtAction(nameof(GetById), new { id = todo.Id }, result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, TodoUpdateDto dto)
    {
        var error = Validate(dto.Title, dto.Description);
        if (error is not null) return BadRequest(error);

        var todo = await _db.Todos.FindAsync(id);
        if (todo is null) return NotFound();
        if (!await CanAccess(todo)) return Forbid();
        if (!await CanEdit(todo))
            return StatusCode(StatusCodes.Status403Forbidden, "Only the project owner can edit tasks");

        todo.Title = dto.Title.Trim();
        todo.Description = Normalize(dto.Description);
        todo.IsDone = dto.IsDone;
        todo.DueDate = dto.DueDate;
        todo.Category = dto.Category;
        todo.Priority = dto.Priority;

        await _db.SaveChangesAsync();
        return Ok(await ToDto(_db.Todos.Where(t => t.Id == id)).FirstAsync());
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var todo = await _db.Todos.FindAsync(id);
        if (todo is null) return NotFound();
        if (!await CanDelete(todo)) return Forbid();

        _db.Todos.Remove(todo);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/claim")]
    public async Task<IActionResult> Claim(Guid id)
    {
        var todo = await _db.Todos.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
        if (todo is null) return NotFound();
        if (!await CanAccess(todo)) return Forbid();
        if (todo.ProjectId is null) return BadRequest("Only project tasks can be taken");
        if (todo.IsDone) return BadRequest("Task is already done");

        var me = CurrentUserId;
        var updated = await _db.Todos
            .Where(t => t.Id == id && (t.AssigneeId == null || t.AssigneeId == me))
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.AssigneeId, me));

        if (updated == 0)
        {
            var taken = await ToDto(_db.Todos.Where(t => t.Id == id)).FirstAsync();
            return Conflict($"Task is already taken by {taken.AssigneeEmail}");
        }

        return Ok(await ToDto(_db.Todos.Where(t => t.Id == id)).FirstAsync());
    }

    [HttpPost("{id:guid}/release")]
    public async Task<IActionResult> Release(Guid id)
    {
        var todo = await _db.Todos.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
        if (todo is null) return NotFound();
        if (!await CanAccess(todo)) return Forbid();

        if (todo.AssigneeId is not null && todo.AssigneeId != CurrentUserId && !IsAdmin &&
            !await _db.Projects.AnyAsync(p => p.Id == todo.ProjectId && p.OwnerId == CurrentUserId))
            return Forbid();

        await _db.Todos
            .Where(t => t.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.AssigneeId, (string?)null));

        return Ok(await ToDto(_db.Todos.Where(t => t.Id == id)).FirstAsync());
    }

    [HttpGet("{id:guid}/progress")]
    public async Task<IActionResult> GetProgress(Guid id)
    {
        var todo = await _db.Todos.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
        if (todo is null) return NotFound();
        if (!await CanAccess(todo)) return Forbid();

        var entries = await ToProgressDto(_db.TodoProgressEntries
                .Where(p => p.TodoItemId == id)
                .OrderBy(p => p.CreatedAt))
            .ToListAsync();
        return Ok(entries);
    }

    [HttpPost("{id:guid}/progress")]
    public async Task<IActionResult> AddProgress(Guid id, TodoProgressCreateDto dto)
    {
        var text = dto.Text?.Trim() ?? "";
        if (text.Length == 0 || text.Length > MaxProgressTextLength)
            return BadRequest($"Message must be 1-{MaxProgressTextLength} characters long");

        var todo = await _db.Todos.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
        if (todo is null) return NotFound();
        if (!await CanAccess(todo)) return Forbid();
        if (todo.AssigneeId != CurrentUserId && !await CanEdit(todo))
            return StatusCode(StatusCodes.Status403Forbidden, "Only the assignee and the project owner can write in the discussion");

        var entry = new TodoProgressEntry
        {
            TodoItemId = id,
            AuthorId = CurrentUserId,
            Text = text
        };
        _db.TodoProgressEntries.Add(entry);
        await _db.SaveChangesAsync();

        var result = await ToProgressDto(_db.TodoProgressEntries.Where(p => p.Id == entry.Id)).FirstAsync();
        return CreatedAtAction(nameof(GetProgress), new { id }, result);
    }

    [HttpPost("{id:guid}/subtasks")]
    public async Task<IActionResult> AddSubtask(Guid id, SubtaskCreateDto dto)
    {
        var error = ValidateSubtaskTitle(dto.Title);
        if (error is not null) return BadRequest(error);

        var todo = await _db.Todos.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
        if (todo is null) return NotFound();
        if (!await CanAccess(todo)) return Forbid();
        if (!await CanAddTo(todo.ProjectId))
            return StatusCode(StatusCodes.Status403Forbidden, "Only the project owner can add subtasks");
        if (await _db.TodoSubtasks.CountAsync(s => s.TodoItemId == id) >= MaxSubtaskCount)
            return BadRequest($"A task can have at most {MaxSubtaskCount} subtasks");

        var subtask = new TodoSubtask
        {
            TodoItemId = id,
            Title = dto.Title.Trim(),
            AuthorId = CurrentUserId
        };
        _db.TodoSubtasks.Add(subtask);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id }, ToSubtaskDto(subtask));
    }

    [HttpPut("{id:guid}/subtasks/{subtaskId:guid}")]
    public async Task<IActionResult> UpdateSubtask(Guid id, Guid subtaskId, SubtaskUpdateDto dto)
    {
        var error = ValidateSubtaskTitle(dto.Title);
        if (error is not null) return BadRequest(error);

        var subtask = await FindSubtask(id, subtaskId);
        if (subtask is null) return NotFound();
        if (!await CanAccess(subtask.TodoItem!)) return Forbid();
        if (subtask.Title != dto.Title.Trim() && !await CanEdit(subtask.TodoItem!))
            return StatusCode(StatusCodes.Status403Forbidden, "Only the project owner can rename subtasks");
        if (subtask.IsDone != dto.IsDone && subtask.TodoItem!.AssigneeId != CurrentUserId && !await CanEdit(subtask.TodoItem!))
            return StatusCode(StatusCodes.Status403Forbidden, "Only the assignee and the project owner can complete subtasks");

        subtask.Title = dto.Title.Trim();
        subtask.IsDone = dto.IsDone;
        await _db.SaveChangesAsync();

        return Ok(ToSubtaskDto(subtask));
    }

    [HttpDelete("{id:guid}/subtasks/{subtaskId:guid}")]
    public async Task<IActionResult> DeleteSubtask(Guid id, Guid subtaskId)
    {
        var subtask = await FindSubtask(id, subtaskId);
        if (subtask is null) return NotFound();
        if (!await CanAccess(subtask.TodoItem!)) return Forbid();
        if (subtask.AuthorId != CurrentUserId && !await CanDelete(subtask.TodoItem!)) return Forbid();

        _db.TodoSubtasks.Remove(subtask);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private Task<TodoSubtask?> FindSubtask(Guid todoId, Guid subtaskId) =>
        _db.TodoSubtasks
            .Include(s => s.TodoItem)
            .FirstOrDefaultAsync(s => s.Id == subtaskId && s.TodoItemId == todoId);

    private static string? ValidateSubtaskTitle(string? title)
    {
        var trimmed = title?.Trim() ?? "";
        return trimmed.Length == 0 || trimmed.Length > MaxTitleLength
            ? $"Subtask title must be 1-{MaxTitleLength} characters long"
            : null;
    }

    private static SubtaskDto ToSubtaskDto(TodoSubtask s) =>
        new(s.Id, s.TodoItemId, s.Title, s.IsDone, s.AuthorId, s.CreatedAt);

    private async Task<bool> CanAccess(TodoItem todo)
    {
        if (IsAdmin) return true;
        if (todo.ProjectId is not { } pid) return todo.UserId == CurrentUserId;
        return await _db.ProjectsAccessibleBy(CurrentUserId).AnyAsync(p => p.Id == pid);
    }

    private async Task<bool> CanAddTo(Guid? projectId)
    {
        if (projectId is not { } pid || IsAdmin) return true;
        return await _db.Projects.AnyAsync(p => p.Id == pid && p.OwnerId == CurrentUserId);
    }

    private async Task<bool> CanEdit(TodoItem todo)
    {
        if (IsAdmin) return true;
        if (todo.ProjectId is not { } pid) return todo.UserId == CurrentUserId;
        return await _db.Projects.AnyAsync(p => p.Id == pid && p.OwnerId == CurrentUserId);
    }

    private async Task<bool> CanDelete(TodoItem todo)
    {
        if (IsAdmin || todo.UserId == CurrentUserId) return true;
        if (todo.ProjectId is not { } pid) return false;
        return await _db.Projects.AnyAsync(p => p.Id == pid && p.OwnerId == CurrentUserId);
    }

    private static string? Validate(string? title, string? description)
    {
        var trimmed = title?.Trim() ?? "";
        if (trimmed.Length == 0 || trimmed.Length > MaxTitleLength)
            return $"Title must be 1-{MaxTitleLength} characters long";
        if (description?.Length > MaxDescriptionLength)
            return $"Description must be at most {MaxDescriptionLength} characters long";
        return null;
    }

    private static string? Normalize(string? description) =>
        string.IsNullOrWhiteSpace(description) ? null : description.Trim();

    private IQueryable<TodoDto> ToDto(IQueryable<TodoItem> query) =>
        from t in query
        join u in _db.Users on t.UserId equals u.Id into authors
        from u in authors.DefaultIfEmpty()
        join a in _db.Users on t.AssigneeId equals a.Id into assignees
        from a in assignees.DefaultIfEmpty()
        select new TodoDto(t.Id, t.Title, t.Description, t.IsDone, t.CreatedAt, t.DueDate, t.Category, t.Priority,
            t.UserId, u == null ? "" : u.Email ?? "", t.ProjectId, t.AssigneeId, a == null ? null : a.Email,
            t.Subtasks
                .OrderBy(s => s.CreatedAt)
                .Select(s => new SubtaskDto(s.Id, s.TodoItemId, s.Title, s.IsDone, s.AuthorId, s.CreatedAt))
                .ToList());

    private IQueryable<TodoProgressDto> ToProgressDto(IQueryable<TodoProgressEntry> query) =>
        from p in query
        join u in _db.Users on p.AuthorId equals u.Id into authors
        from u in authors.DefaultIfEmpty()
        select new TodoProgressDto(p.Id, p.TodoItemId, p.AuthorId, u == null ? "" : u.Email ?? "", p.Text, p.CreatedAt);
}
