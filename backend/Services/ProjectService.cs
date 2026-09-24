using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TodoApp.Backend.Data;
using TodoApp.Backend.Models;

namespace TodoApp.Backend.Services;

public class ProjectService
{
    private const int MaxNameLength = 100;

    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _userManager;
    private readonly ICurrentUser _user;

    public ProjectService(AppDbContext db, UserManager<AppUser> userManager, ICurrentUser user)
    {
        _db = db;
        _userManager = userManager;
        _user = user;
    }

    public async Task<List<ProjectDto>> GetAll()
    {
        var projects = await LoadProjects()
            .OrderBy(p => p.Name)
            .ToListAsync();
        var counts = await LoadTaskCounts(projects.Select(p => p.Id).ToList());
        return projects.Select(p => ToDto(p, counts)).ToList();
    }

    public async Task<Result<ProjectDto>> GetById(Guid id)
    {
        var project = await LoadProjects().FirstOrDefaultAsync(p => p.Id == id);
        if (project is null) return ServiceError.NotFound();
        var counts = await LoadTaskCounts([id]);
        return ToDto(project, counts);
    }

    public async Task<Result<ProjectDto>> Create(ProjectSaveDto dto)
    {
        if (ValidateName(dto.Name) is { } error) return error;

        var project = new Project { Name = dto.Name.Trim(), OwnerId = _user.Id };
        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        return await GetById(project.Id);
    }

    public async Task<Result<ProjectDto>> Rename(Guid id, ProjectSaveDto dto)
    {
        if (ValidateName(dto.Name) is { } error) return error;

        var project = await _db.Projects.FindAsync(id);
        if (project is null) return ServiceError.NotFound();
        if (project.OwnerId != _user.Id) return ServiceError.Forbidden();

        project.Name = dto.Name.Trim();
        await _db.SaveChangesAsync();
        return await GetById(id);
    }

    public async Task<Result> Delete(Guid id)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project is null) return ServiceError.NotFound();
        if (project.OwnerId != _user.Id) return ServiceError.Forbidden();

        _db.Projects.Remove(project);
        await _db.SaveChangesAsync();
        return Result.Success;
    }

    public async Task<Result<ProjectDto>> AddMember(Guid id, ProjectMemberAddDto dto)
    {
        var project = await _db.Projects.Include(p => p.Members).FirstOrDefaultAsync(p => p.Id == id);
        if (project is null) return ServiceError.NotFound();
        if (project.OwnerId != _user.Id) return ServiceError.Forbidden();

        var user = await _userManager.FindByEmailAsync(dto.Email?.Trim() ?? "");
        if (user is null) return ServiceError.Invalid("User with this email not found");
        if (user.IsBanned) return ServiceError.Invalid("User is banned");
        if (user.Id == project.OwnerId) return ServiceError.Invalid("Owner is already a member of the project");
        if (project.Members.Any(m => m.UserId == user.Id))
            return ServiceError.Conflict("User is already a member of the project");

        project.Members.Add(new ProjectMember { UserId = user.Id });
        await _db.SaveChangesAsync();
        return await GetById(id);
    }

    public async Task<Result> RemoveMember(Guid id, string userId)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project is null) return ServiceError.NotFound();
        if (project.OwnerId != _user.Id && userId != _user.Id) return ServiceError.Forbidden();
        if (userId == project.OwnerId) return ServiceError.Invalid("Owner cannot be removed from the project");

        var member = await _db.ProjectMembers.FindAsync(id, userId);
        if (member is null) return ServiceError.NotFound();

        _db.ProjectMembers.Remove(member);
        await _db.SaveChangesAsync();

        await _db.Todos
            .Where(t => t.ProjectId == id && t.AssigneeId == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.AssigneeId, (string?)null));

        return Result.Success;
    }

    private IQueryable<Project> LoadProjects() =>
        _db.ProjectsAccessibleBy(_user.Id)
            .AsNoTracking()
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

        return new ProjectDto(p.Id, p.Name, p.CreatedAt, p.OwnerId, p.Owner!.Email ?? "", p.OwnerId == _user.Id, total, open, members);
    }

    private static ServiceError? ValidateName(string? name)
    {
        var trimmed = name?.Trim() ?? "";
        return trimmed.Length == 0 || trimmed.Length > MaxNameLength
            ? ServiceError.Invalid($"Project name must be 1-{MaxNameLength} characters long")
            : null;
    }
}
