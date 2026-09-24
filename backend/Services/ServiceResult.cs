namespace TodoApp.Backend.Services;

public enum ServiceErrorKind
{
    NotFound,
    Forbidden,
    Validation,
    Conflict
}

public sealed record ServiceError(ServiceErrorKind Kind, string? Message = null)
{
    public static ServiceError NotFound() => new(ServiceErrorKind.NotFound);
    public static ServiceError Forbidden(string? message = null) => new(ServiceErrorKind.Forbidden, message);
    public static ServiceError Invalid(string message) => new(ServiceErrorKind.Validation, message);
    public static ServiceError Conflict(string message) => new(ServiceErrorKind.Conflict, message);
}

public readonly struct Result
{
    private Result(ServiceError? error) => Error = error;

    public ServiceError? Error { get; }

    public static Result Success => default;

    public static implicit operator Result(ServiceError error) => new(error);
}

public readonly struct Result<T>
{
    private Result(T? value, ServiceError? error)
    {
        Value = value;
        Error = error;
    }

    public T? Value { get; }
    public ServiceError? Error { get; }

    public static implicit operator Result<T>(T value) => new(value, null);
    public static implicit operator Result<T>(ServiceError error) => new(default, error);
}
