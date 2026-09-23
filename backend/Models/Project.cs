namespace TodoApp.Backend.Models;

public class Project
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public string OwnerId { get; set; } = string.Empty;
    public AppUser? Owner { get; set; }

    public List<ProjectMember> Members { get; set; } = [];
}

public class ProjectMember
{
    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    public string UserId { get; set; } = string.Empty;
    public AppUser? User { get; set; }

    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}

public record ProjectSaveDto(string Name);
public record ProjectMemberAddDto(string Email);
public record ProjectMemberDto(string UserId, string Email, bool IsOwner);
public record ProjectDto(Guid Id, string Name, DateTime CreatedAt, string OwnerId, string OwnerEmail, bool IsOwner, int TaskCount, int OpenTaskCount, IEnumerable<ProjectMemberDto> Members);
