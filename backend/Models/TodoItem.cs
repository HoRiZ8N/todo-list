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

    // Владелец задачи
    public string UserId { get; set; } = string.Empty;
}

public record TodoCreateDto(string Title, string? Description, DateTime? DueDate, string? Category, TodoPriority Priority);
public record TodoUpdateDto(string Title, string? Description, bool IsDone, DateTime? DueDate, string? Category, TodoPriority Priority);