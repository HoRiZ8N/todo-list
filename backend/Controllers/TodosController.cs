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
    private readonly AppDbContext _db;

    public TodosController(AppDbContext db)
    {
        _db = db;
    }

    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!;

    private bool IsAdmin => User.IsInRole(Roles.Admin);

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? category = null)
    {
        var query = IsAdmin ? _db.Todos : _db.Todos.Where(t => t.UserId == CurrentUserId);

        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(t => t.Category == category);

        return Ok(await query
            .OrderByDescending(t => t.Priority)
            .ThenByDescending(t => t.CreatedAt)
            .ToListAsync());
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var todo = await _db.Todos.FindAsync(id);
        if (todo is null) return NotFound();
        if (!IsAdmin && todo.UserId != CurrentUserId) return Forbid();
        return Ok(todo);
    }

    [HttpPost]
    public async Task<IActionResult> Create(TodoCreateDto dto)
    {
        var todo = new TodoItem
        {
            Title = dto.Title,
            Description = dto.Description,
            DueDate = dto.DueDate,
            Category = dto.Category,
            Priority = dto.Priority,
            UserId = CurrentUserId
        };
        _db.Todos.Add(todo);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = todo.Id }, todo);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, TodoUpdateDto dto)
    {
        var todo = await _db.Todos.FindAsync(id);
        if (todo is null) return NotFound();
        if (!IsAdmin && todo.UserId != CurrentUserId) return Forbid();

        todo.Title = dto.Title;
        todo.Description = dto.Description;
        todo.IsDone = dto.IsDone;
        todo.DueDate = dto.DueDate;
        todo.Category = dto.Category;
        todo.Priority = dto.Priority;

        await _db.SaveChangesAsync();
        return Ok(todo);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var todo = await _db.Todos.FindAsync(id);
        if (todo is null) return NotFound();
        if (!IsAdmin && todo.UserId != CurrentUserId) return Forbid();

        _db.Todos.Remove(todo);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}