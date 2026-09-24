using System.Security.Claims;
using TodoApp.Backend.Models;

namespace TodoApp.Backend.Services;

public interface ICurrentUser
{
    string Id { get; }
    bool IsAdmin { get; }
}

public class HttpCurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _accessor;

    public HttpCurrentUser(IHttpContextAccessor accessor)
    {
        _accessor = accessor;
    }

    private ClaimsPrincipal Principal => _accessor.HttpContext?.User ?? new ClaimsPrincipal();

    public string Id => Principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? Principal.FindFirstValue("sub")
        ?? string.Empty;

    public bool IsAdmin => Principal.IsInRole(Roles.Admin);
}
