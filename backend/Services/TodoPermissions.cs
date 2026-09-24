using Microsoft.EntityFrameworkCore;
using TodoApp.Backend.Data;
using TodoApp.Backend.Models;

namespace TodoApp.Backend.Services;

public class TodoPermissions
{
    private readonly AppDbContext _db;
    private readonly ICurrentUser _user;

    public TodoPermissions(AppDbContext db, ICurrentUser user)
    {
        _db = db;
        _user = user;
    }

    public async Task<bool> CanAccessProject(Guid projectId) =>
        _user.IsAdmin || await _db.ProjectsAccessibleBy(_user.Id).AnyAsync(p => p.Id == projectId);

    public async Task<bool> CanAccess(TodoItem todo)
    {
        if (todo.ProjectId is not { } pid) return _user.IsAdmin || todo.UserId == _user.Id;
        return await CanAccessProject(pid);
    }

    public async Task<bool> CanAddTo(Guid? projectId)
    {
        if (projectId is not { } pid || _user.IsAdmin) return true;
        return await IsProjectOwner(pid);
    }

    public async Task<bool> CanEdit(TodoItem todo)
    {
        if (_user.IsAdmin) return true;
        if (todo.ProjectId is not { } pid) return todo.UserId == _user.Id;
        return await IsProjectOwner(pid);
    }

    public async Task<bool> CanDelete(TodoItem todo)
    {
        if (_user.IsAdmin || todo.UserId == _user.Id) return true;
        if (todo.ProjectId is not { } pid) return false;
        return await IsProjectOwner(pid);
    }

    public async Task<bool> CanWorkOn(TodoItem todo) =>
        todo.AssigneeId == _user.Id || await CanEdit(todo);

    public async Task<bool> CanRelease(TodoItem todo)
    {
        if (todo.AssigneeId is null || todo.AssigneeId == _user.Id || _user.IsAdmin) return true;
        return todo.ProjectId is { } pid && await IsProjectOwner(pid);
    }

    private Task<bool> IsProjectOwner(Guid projectId) =>
        _db.Projects.AnyAsync(p => p.Id == projectId && p.OwnerId == _user.Id);
}
