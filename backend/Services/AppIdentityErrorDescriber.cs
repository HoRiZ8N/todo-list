using Microsoft.AspNetCore.Identity;

namespace TodoApp.Backend.Services;

public class AppIdentityErrorDescriber : IdentityErrorDescriber
{
    private static IdentityError Error(string code, string description) => new() { Code = code, Description = description };

    public override IdentityError DefaultError() =>
        Error(nameof(DefaultError), "An unknown error occurred");

    public override IdentityError DuplicateUserName(string userName) =>
        Error(nameof(DuplicateUserName), $"A user with email {userName} is already registered");

    public override IdentityError DuplicateEmail(string email) =>
        Error(nameof(DuplicateEmail), $"A user with email {email} is already registered");

    public override IdentityError InvalidUserName(string? userName) =>
        Error(nameof(InvalidUserName), $"Email \"{userName}\" contains invalid characters: only Latin letters, digits and - . _ @ + are allowed");

    public override IdentityError InvalidEmail(string? email) =>
        Error(nameof(InvalidEmail), $"Invalid email \"{email}\"");

    public override IdentityError PasswordTooShort(int length) =>
        Error(nameof(PasswordTooShort), $"Password must be at least {length} characters long");

    public override IdentityError PasswordRequiresDigit() =>
        Error(nameof(PasswordRequiresDigit), "Password must contain at least one digit (0-9)");

    public override IdentityError PasswordRequiresLower() =>
        Error(nameof(PasswordRequiresLower), "Password must contain at least one lowercase letter (a-z)");

    public override IdentityError PasswordRequiresUpper() =>
        Error(nameof(PasswordRequiresUpper), "Password must contain at least one uppercase letter (A-Z)");

    public override IdentityError PasswordRequiresNonAlphanumeric() =>
        Error(nameof(PasswordRequiresNonAlphanumeric), "Password must contain at least one special character");

    public override IdentityError PasswordRequiresUniqueChars(int uniqueChars) =>
        Error(nameof(PasswordRequiresUniqueChars), $"Password must contain at least {uniqueChars} unique characters");
}
