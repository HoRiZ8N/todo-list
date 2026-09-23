using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApp.Backend.Data;
using TodoApp.Backend.Models;

namespace TodoApp.Backend.Controllers;

[ApiController]
[Route("api/projects")]
[Authorize]
public class ProjectsController : ControllerBase
{
    private const int MaxNameLength = 100;

    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _userManager;

    public ProjectsController(AppDbContext db, UserManager<AppUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var projects = await LoadProjects(_db.ProjectsAccessibleBy(CurrentUserId))
            .OrderBy(p => p.Name)
            .ToListAsync();
        var counts = await LoadTaskCounts(projects.Select(p => p.Id).ToList());
        return Ok(projects.Select(p => ToDto(p, counts)));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var project = await LoadProjects(_db.ProjectsAccessibleBy(CurrentUserId))
            .FirstOrDefaultAsync(p => p.Id == id);
        if (project is null) return NotFound();
        var counts = await LoadTaskCounts([id]);
        return Ok(ToDto(project, counts));
    }

    [HttpPost]
    public async Task<IActionResult> Create(ProjectSaveDto dto)
    {
        var name = dto.Name?.Trim() ?? "";
        if (name.Length == 0 || name.Length > MaxNameLength)
            return BadRequest($"Project name must be 1-{MaxNameLength} characters long");

        var project = new Project { Name = name, OwnerId = CurrentUserId };
        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        return await GetById(project.Id);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Rename(Guid id, ProjectSaveDto dto)
    {
        var name = dto.Name?.Trim() ?? "";
        if (name.Length == 0 || name.Length > MaxNameLength)
            return BadRequest($"Project name must be 1-{MaxNameLength} characters long");

        var project = await _db.Projects.FindAsync(id);
        if (project is null) return NotFound();
        if (project.OwnerId != CurrentUserId) return Forbid();

        project.Name = name;
        await _db.SaveChangesAsync();
        return await GetById(id);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project is null) return NotFound();
        if (project.OwnerId != CurrentUserId) return Forbid();

        _db.Projects.Remove(project);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/members")]
    public async Task<IActionResult> AddMember(Guid id, ProjectMemberAddDto dto)
    {
        var project = await _db.Projects.Include(p => p.Members).FirstOrDefaultAsync(p => p.Id == id);
        if (project is null) return NotFound();
        if (project.OwnerId != CurrentUserId) return Forbid();

        var user = await _userManager.FindByEmailAsync(dto.Email?.Trim() ?? "");
        if (user is null) return BadRequest("User with this email not found");
        if (user.IsBanned) return BadRequest("User is banned");
        if (user.Id == project.OwnerId) return BadRequest("Owner is already a member of the project");
        if (project.Members.Any(m => m.UserId == user.Id)) return Conflict("User is already a member of the project");

        project.Members.Add(new ProjectMember { UserId = user.Id });
        await _db.SaveChangesAsync();
        return await GetById(id);
    }

    [HttpDelete("{id:guid}/members/{userId}")]
    public async Task<IActionResult> RemoveMember(Guid id, string userId)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project is null) return NotFound();

        var isOwner = project.OwnerId == CurrentUserId;
        if (!isOwner && userId != CurrentUserId) return Forbid();
        if (userId == project.OwnerId) return BadRequest("Owner cannot be removed from the project");

        var member = await _db.ProjectMembers.FindAsync(id, userId);
        if (member is null) return NotFound();

        _db.ProjectMembers.Remove(member);
        await _db.SaveChangesAsync();

        await _db.Todos
            .Where(t => t.ProjectId == id && t.AssigneeId == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.AssigneeId, (string?)null));

        return NoContent();
    }

    private static IQueryable<Project> LoadProjects(IQueryable<Project> query) =>
        query.AsNoTracking()
            .Include(p => p.Owner)
            .Include(p => p.Members).ThenInclude(m => m.User);

    private async Task<Dictionary<Guid, (int Total, int Open)>> LoadTaskCounts(List<Guid> ids) =>
        (await _db.Todos
            .Where(t => t.ProjectId != null && ids.Contains(t.ProjectId.Value))
            .GroupBy(t => t.ProjectId!.Value)
            .Select(g => new { Id = g.Key, Total = g.Count(), Open = g.Count(t => !t.IsDone) })
            .ToListAsync())
        .ToDictionary(x => x.Id, x => (x.Total, x.Open));

    private ProjectDto ToDto(Project p, Dictionary<Guid, (int Total, int Open)> counts)
    {
        var (total, open) = counts.GetValueOrDefault(p.Id);
        var members = p.Members
            .OrderBy(m => m.User!.Email)
            .Select(m => new ProjectMemberDto(m.UserId, m.User!.Email ?? "", false))
            .Prepend(new ProjectMemberDto(p.OwnerId, p.Owner!.Email ?? "", true));

        return new ProjectDto(p.Id, p.Name, p.CreatedAt, p.OwnerId, p.Owner!.Email ?? "", p.OwnerId == CurrentUserId, total, open, members);
    }
}
