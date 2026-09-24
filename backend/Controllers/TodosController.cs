using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TodoApp.Backend.Models;
using TodoApp.Backend.Services;

namespace TodoApp.Backend.Controllers;

[ApiController]
[Route("api/todos")]
[Authorize]
public class TodosController : ApiControllerBase
{
    private readonly TodoService _todos;
    private readonly SubtaskService _subtasks;
    private readonly TodoProgressService _progress;

    public TodosController(TodoService todos, SubtaskService subtasks, TodoProgressService progress)
    {
        _todos = todos;
        _subtasks = subtasks;
        _progress = progress;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? projectId = null, [FromQuery] string? category = null) =>
        ToActionResult(await _todos.GetAll(projectId, category));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id) =>
        ToActionResult(await _todos.GetById(id));

    [HttpPost]
    public async Task<IActionResult> Create(TodoCreateDto dto) =>
        ToActionResult(await _todos.Create(dto), todo => CreatedAtAction(nameof(GetById), new { id = todo.Id }, todo));

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, TodoUpdateDto dto) =>
        ToActionResult(await _todos.Update(id, dto));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id) =>
        ToActionResult(await _todos.Delete(id));

    [HttpPost("{id:guid}/claim")]
    public async Task<IActionResult> Claim(Guid id) =>
        ToActionResult(await _todos.Claim(id));

    [HttpPost("{id:guid}/release")]
    public async Task<IActionResult> Release(Guid id) =>
        ToActionResult(await _todos.Release(id));

    [HttpGet("{id:guid}/progress")]
    public async Task<IActionResult> GetProgress(Guid id) =>
        ToActionResult(await _progress.GetAll(id));

    [HttpPost("{id:guid}/progress")]
    public async Task<IActionResult> AddProgress(Guid id, TodoProgressCreateDto dto) =>
        ToActionResult(await _progress.Add(id, dto), entry => CreatedAtAction(nameof(GetProgress), new { id }, entry));

    [HttpPost("{id:guid}/subtasks")]
    public async Task<IActionResult> AddSubtask(Guid id, SubtaskCreateDto dto) =>
        ToActionResult(await _subtasks.Add(id, dto), subtask => CreatedAtAction(nameof(GetById), new { id }, subtask));

    [HttpPut("{id:guid}/subtasks/{subtaskId:guid}")]
    public async Task<IActionResult> UpdateSubtask(Guid id, Guid subtaskId, SubtaskUpdateDto dto) =>
        ToActionResult(await _subtasks.Update(id, subtaskId, dto));

    [HttpDelete("{id:guid}/subtasks/{subtaskId:guid}")]
    public async Task<IActionResult> DeleteSubtask(Guid id, Guid subtaskId) =>
        ToActionResult(await _subtasks.Delete(id, subtaskId));
}
