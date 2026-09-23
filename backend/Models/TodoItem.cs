namespace TodoApp.Backend.Models;

public enum TodoPriority
{
    Low = 0,
    Medium = 1,
    High = 2
}

public class TodoItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsDone { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DueDate { get; set; }
    public string? Category { get; set; }
    public TodoPriority Priority { get; set; } = TodoPriority.Medium;

    public string UserId { get; set; } = string.Empty;

    public Guid? ProjectId { get; set; }
    public Project? Project { get; set; }

    public string? AssigneeId { get; set; }
    public AppUser? Assignee { get; set; }

    public List<TodoProgressEntry> ProgressEntries { get; set; } = [];
}

public class TodoProgressEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TodoItemId { get; set; }
    public TodoItem? TodoItem { get; set; }
    public string AuthorId { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public record TodoCreateDto(string Title, string? Description, DateTime? DueDate, string? Category, TodoPriority Priority, Guid? ProjectId);
public record TodoUpdateDto(string Title, string? Description, bool IsDone, DateTime? DueDate, string? Category, TodoPriority Priority);
public record TodoDto(Guid Id, string Title, string? Description, bool IsDone, DateTime CreatedAt, DateTime? DueDate, string? Category, TodoPriority Priority, string UserId, string AuthorEmail, Guid? ProjectId, string? AssigneeId, string? AssigneeEmail);
public record TodoProgressCreateDto(string Text);
public record TodoProgressDto(Guid Id, Guid TodoItemId, string AuthorId, string AuthorEmail, string Text, DateTime CreatedAt);
