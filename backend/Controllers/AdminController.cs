using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApp.Backend.Data;
using TodoApp.Backend.Models;

namespace TodoApp.Backend.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = Roles.Admin)]
public class AdminController : ControllerBase
{
    private readonly UserManager<AppUser> _userManager;
    private readonly AppDbContext _db;

    public AdminController(UserManager<AppUser> userManager, AppDbContext db)
    {
        _userManager = userManager;
        _db = db;
    }

    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!;

    [HttpGet("users")]
    public async Task<IActionResult> GetAllUsers()
    {
        var users = new List<AdminUserDto>();
        foreach (var u in _userManager.Users.ToList())
        {
            var roles = await _userManager.GetRolesAsync(u);
            users.Add(new AdminUserDto(u.Id, u.Email ?? "", roles.FirstOrDefault() ?? Roles.User, u.IsBanned));
        }
        return Ok(users);
    }

    [HttpGet("todos")]
    public async Task<IActionResult> GetAllTodos()
    {
        return Ok(await _db.Todos.ToListAsync());
    }

    [HttpPost("users/{id}/ban")]
    public async Task<IActionResult> BanUser(string id)
    {
        if (id == CurrentUserId)
            return BadRequest("Нельзя заблокировать самого себя");

        var user = await _userManager.FindByIdAsync(id);
        if (user is null) return NotFound();

        user.IsBanned = true;
        await _userManager.UpdateAsync(user);
        return NoContent();
    }

    [HttpPost("users/{id}/unban")]
    public async Task<IActionResult> UnbanUser(string id)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user is null) return NotFound();

        user.IsBanned = false;
        await _userManager.UpdateAsync(user);
        return NoContent();
    }

    [HttpDelete("users/{id}")]
    public async Task<IActionResult> DeleteUser(string id)
    {
        if (id == CurrentUserId)
            return BadRequest("Нельзя удалить самого себя");

        var user = await _userManager.FindByIdAsync(id);
        if (user is null) return NotFound();

        await _userManager.DeleteAsync(user);
        return NoContent();
    }
}
