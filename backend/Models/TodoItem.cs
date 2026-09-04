namespace TodoApp.Backend.Models;

public class TodoItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsDone { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DueDate { get; set; }

    // Владелец задачи
    public string UserId { get; set; } = string.Empty;
}

public record TodoCreateDto(string Title, string? Description, DateTime? DueDate);
public record TodoUpdateDto(string Title, string? Description, bool IsDone, DateTime? DueDate);
