using Microsoft.AspNetCore.Identity;

namespace TodoApp.Backend.Models;

public class AppUser : IdentityUser
{
}

public static class Roles
{
    public const string User = "User";
    public const string Admin = "Admin";
}

public record RegisterDto(string Email, string Password);
public record LoginDto(string Email, string Password);
public record AuthResponseDto(string Token, string Email, string Role);
