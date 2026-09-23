using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using TodoApp.Backend.Models;

namespace TodoApp.Backend.Data;

public class AppDbContext : IdentityDbContext<AppUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<TodoItem> Todos => Set<TodoItem>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectMember> ProjectMembers => Set<ProjectMember>();
    public DbSet<TodoProgressEntry> TodoProgressEntries => Set<TodoProgressEntry>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Project>(e =>
        {
            e.Property(p => p.Name).HasMaxLength(100).IsRequired();
            e.HasOne(p => p.Owner)
                .WithMany()
                .HasForeignKey(p => p.OwnerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<ProjectMember>(e =>
        {
            e.HasKey(m => new { m.ProjectId, m.UserId });
            e.HasOne(m => m.Project)
                .WithMany(p => p.Members)
                .HasForeignKey(m => m.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(m => m.User)
                .WithMany()
                .HasForeignKey(m => m.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<TodoItem>(e =>
        {
            e.Property(t => t.Title).HasMaxLength(200).IsRequired();
            e.Property(t => t.Description).HasMaxLength(4000);
            e.HasIndex(t => t.ProjectId);
            e.HasIndex(t => t.AssigneeId);
            e.HasOne(t => t.Assignee)
                .WithMany()
                .HasForeignKey(t => t.AssigneeId)
                .OnDelete(DeleteBehavior.SetNull);
            e.HasOne(t => t.Project)
                .WithMany()
                .HasForeignKey(t => t.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<TodoProgressEntry>(e =>
        {
            e.Property(p => p.Text).HasMaxLength(2000).IsRequired();
            e.HasIndex(p => p.TodoItemId);
            e.HasOne(p => p.TodoItem)
                .WithMany(t => t.ProgressEntries)
                .HasForeignKey(p => p.TodoItemId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    public IQueryable<Project> ProjectsAccessibleBy(string userId) =>
        Projects.Where(p => p.OwnerId == userId || p.Members.Any(m => m.UserId == userId));
}
