using Microsoft.AspNetCore.Identity;

namespace TodoApp.Backend.Models;

public class AppUser : IdentityUser
{
    public bool IsBanned { get; set; }
}

public static class Roles
{
    public const string User = "User";
    public const string Admin = "Admin";
}

public record RegisterDto(string Email, string Password);
public record LoginDto(string Email, string Password);
public record AuthResponseDto(string Token, string Email, string Role);
public record ErrorResponseDto(string Message, IEnumerable<string> Errors);
public record AdminUserDto(string Id, string Email, string Role, bool IsBanned);
