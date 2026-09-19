using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using TodoApp.Backend.Models;
using TodoApp.Backend.Services;

namespace TodoApp.Backend.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<AppUser> _userManager;
    private readonly JwtService _jwt;

    public AuthController(UserManager<AppUser> userManager, JwtService jwt)
    {
        _userManager = userManager;
        _jwt = jwt;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Email) || !new EmailAddressAttribute().IsValid(dto.Email))
            return BadRequest(new ErrorResponseDto(RegisterFailed, [$"Invalid email \"{dto.Email}\""]));

        var user = new AppUser { UserName = dto.Email, Email = dto.Email };
        var result = await _userManager.CreateAsync(user, dto.Password);

        if (!result.Succeeded)
            return BadRequest(ToError(result));

        var roleResult = await _userManager.AddToRoleAsync(user, Roles.User);
        if (!roleResult.Succeeded)
        {
            await _userManager.DeleteAsync(user);
            return StatusCode(500, ToError(roleResult));
        }

        var roles = await _userManager.GetRolesAsync(user);
        var token = _jwt.GenerateToken(user, roles);

        return Ok(new AuthResponseDto(token, user.Email!, roles.First()));
    }

    private const string RegisterFailed = "Sign up failed";

    private static ErrorResponseDto ToError(IdentityResult result) =>
        new(RegisterFailed, result.Errors.Select(e => e.Description).Distinct());

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginDto dto)
    {
        var user = await _userManager.FindByEmailAsync(dto.Email);
        if (user is null || !await _userManager.CheckPasswordAsync(user, dto.Password))
            return Unauthorized("Invalid email or password");

        if (user.IsBanned)
            return StatusCode(403, "Account has been banned by an administrator");

        var roles = await _userManager.GetRolesAsync(user);
        var token = _jwt.GenerateToken(user, roles);

        return Ok(new AuthResponseDto(token, user.Email!, roles.FirstOrDefault() ?? Roles.User));
    }
}
