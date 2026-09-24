using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TodoApp.Backend.Models;
using TodoApp.Backend.Services;

namespace TodoApp.Backend.Controllers;

[ApiController]
[Route("api/projects")]
[Authorize]
public class ProjectsController : ApiControllerBase
{
    private readonly ProjectService _projects;

    public ProjectsController(ProjectService projects)
    {
        _projects = projects;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(await _projects.GetAll());

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id) =>
        ToActionResult(await _projects.GetById(id));

    [HttpPost]
    public async Task<IActionResult> Create(ProjectSaveDto dto) =>
        ToActionResult(await _projects.Create(dto));

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Rename(Guid id, ProjectSaveDto dto) =>
        ToActionResult(await _projects.Rename(id, dto));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id) =>
        ToActionResult(await _projects.Delete(id));

    [HttpPost("{id:guid}/members")]
    public async Task<IActionResult> AddMember(Guid id, ProjectMemberAddDto dto) =>
        ToActionResult(await _projects.AddMember(id, dto));

    [HttpDelete("{id:guid}/members/{userId}")]
    public async Task<IActionResult> RemoveMember(Guid id, string userId) =>
        ToActionResult(await _projects.RemoveMember(id, userId));
}
