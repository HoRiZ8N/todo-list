using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TodoApp.Backend.Data;
using TodoApp.Backend.Models;
using TodoApp.Backend.Services;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Data Source=todo.db";
builder.Services.AddDbContext<AppDbContext>(opt => opt.UseSqlite(connectionString));

// Identity
builder.Services
    .AddIdentity<AppUser, IdentityRole>(opt =>
    {
        opt.Password.RequireNonAlphanumeric = false;
        opt.Password.RequiredLength = 6;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddErrorDescriber<AppIdentityErrorDescriber>()
    .AddDefaultTokenProviders();

// JWT
var jwtKey = builder.Configuration["Jwt:Key"] ?? "super-secret-dev-key-change-me-1234567890";
builder.Configuration["Jwt:Key"] = jwtKey;
builder.Configuration["Jwt:Issuer"] ??= "TodoApp";
builder.Configuration["Jwt:Audience"] ??= "TodoAppClient";

builder.Services.AddAuthentication(opt =>
{
    opt.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    opt.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(opt =>
{
    opt.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
    };
});

builder.Services.AddScoped<JwtService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(opt =>
{
    opt.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();

    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
    foreach (var role in new[] { Roles.User, Roles.Admin })
    {
        if (!await roleManager.RoleExistsAsync(role))
            await roleManager.CreateAsync(new IdentityRole(role));
    }

    var adminEmail = builder.Configuration["Admin:Email"];
    var adminPassword = builder.Configuration["Admin:Password"];
    if (!string.IsNullOrWhiteSpace(adminEmail) && !string.IsNullOrWhiteSpace(adminPassword))
    {
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var existingAdmin = await userManager.FindByEmailAsync(adminEmail);

        if (existingAdmin is null)
        {
            var admin = new AppUser { UserName = adminEmail, Email = adminEmail, EmailConfirmed = true };
            var result = await userManager.CreateAsync(admin, adminPassword);
            if (!result.Succeeded)
                throw new InvalidOperationException(
                    $"Failed to create admin {adminEmail}: {string.Join("; ", result.Errors.Select(e => e.Description))}");

            await userManager.AddToRoleAsync(admin, Roles.Admin);
        }
        else if (!await userManager.IsInRoleAsync(existingAdmin, Roles.Admin))
        {
            await userManager.AddToRoleAsync(existingAdmin, Roles.Admin);
        }
    }

    var seedUsers = new[]
    {
        ("user1@gmail.com", "User123"),
        ("user2@gmail.com", "User123"),
        ("user3@gmail.com", "User123"),
    };

    var seedUserManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
    foreach (var (email, password) in seedUsers)
    {
        var existing = await seedUserManager.FindByEmailAsync(email);
        if (existing is not null) continue;

        var user = new AppUser { UserName = email, Email = email, EmailConfirmed = true };
        var result = await seedUserManager.CreateAsync(user, password);
        if (!result.Succeeded)
            throw new InvalidOperationException(
                $"Failed to seed user {email}: {string.Join("; ", result.Errors.Select(e => e.Description))}");

        await seedUserManager.AddToRoleAsync(user, Roles.User);
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();

app.Use(async (context, next) =>
{
    if (context.User.Identity?.IsAuthenticated == true)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? context.User.FindFirstValue("sub");

        if (userId is not null)
        {
            var db = context.RequestServices.GetRequiredService<AppDbContext>();
            var isBanned = await db.Users
                .Where(u => u.Id == userId)
                .Select(u => u.IsBanned)
                .FirstOrDefaultAsync();

            if (isBanned)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsync("Account has been banned by an administrator");
                return;
            }
        }
    }

    await next();
});

app.UseAuthorization();
app.MapControllers();

app.Run();