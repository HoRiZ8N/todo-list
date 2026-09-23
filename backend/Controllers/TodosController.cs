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

        if (dto.ProjectId is { } pid && !await _db.ProjectsAccessibleBy(CurrentUserId).AnyAsync(p => p.Id == pid))
            return Forbid();

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

    private async Task<bool> CanAccess(TodoItem todo)
    {
        if (IsAdmin) return true;
        if (todo.ProjectId is not { } pid) return todo.UserId == CurrentUserId;
        return await _db.ProjectsAccessibleBy(CurrentUserId).AnyAsync(p => p.Id == pid);
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
        select new TodoDto(t.Id, t.Title, t.Description, t.IsDone, t.CreatedAt, t.DueDate, t.Category, t.Priority,
            t.UserId, u == null ? "" : u.Email ?? "", t.ProjectId);
}
