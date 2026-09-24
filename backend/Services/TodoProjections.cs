using TodoApp.Backend.Data;
using TodoApp.Backend.Models;

namespace TodoApp.Backend.Services;

public static class TodoProjections
{
    public static IQueryable<TodoDto> SelectTodoDtos(this AppDbContext db, IQueryable<TodoItem> query) =>
        from t in query
        join u in db.Users on t.UserId equals u.Id into authors
        from u in authors.DefaultIfEmpty()
        join a in db.Users on t.AssigneeId equals a.Id into assignees
        from a in assignees.DefaultIfEmpty()
        select new TodoDto(t.Id, t.Title, t.Description, t.IsDone, t.CreatedAt, t.DueDate, t.Category, t.Priority,
            t.UserId, u == null ? "" : u.Email ?? "", t.ProjectId, t.AssigneeId, a == null ? null : a.Email,
            t.Subtasks
                .OrderBy(s => s.CreatedAt)
                .Select(s => new SubtaskDto(s.Id, s.TodoItemId, s.Title, s.IsDone, s.AuthorId, s.CreatedAt))
                .ToList());

    public static IQueryable<TodoProgressDto> SelectProgressDtos(this AppDbContext db, IQueryable<TodoProgressEntry> query) =>
        from p in query
        join u in db.Users on p.AuthorId equals u.Id into authors
        from u in authors.DefaultIfEmpty()
        select new TodoProgressDto(p.Id, p.TodoItemId, p.AuthorId, u == null ? "" : u.Email ?? "", p.Text, p.CreatedAt);

    public static SubtaskDto ToDto(this TodoSubtask s) =>
        new(s.Id, s.TodoItemId, s.Title, s.IsDone, s.AuthorId, s.CreatedAt);
}
