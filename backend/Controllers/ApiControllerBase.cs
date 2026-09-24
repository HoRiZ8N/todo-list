using Microsoft.AspNetCore.Mvc;
using TodoApp.Backend.Services;

namespace TodoApp.Backend.Controllers;

public abstract class ApiControllerBase : ControllerBase
{
    protected IActionResult ToActionResult(Result result) =>
        result.Error is { } error ? Failure(error) : NoContent();

    protected IActionResult ToActionResult<T>(Result<T> result) =>
        ToActionResult(result, value => Ok(value));

    protected IActionResult ToActionResult<T>(Result<T> result, Func<T, IActionResult> onSuccess) =>
        result.Error is { } error ? Failure(error) : onSuccess(result.Value!);

    private IActionResult Failure(ServiceError error) => error.Kind switch
    {
        ServiceErrorKind.NotFound => NotFound(),
        ServiceErrorKind.Forbidden when error.Message is null => Forbid(),
        ServiceErrorKind.Forbidden => StatusCode(StatusCodes.Status403Forbidden, error.Message),
        ServiceErrorKind.Validation => BadRequest(error.Message),
        ServiceErrorKind.Conflict => Conflict(error.Message),
        _ => throw new ArgumentOutOfRangeException(nameof(error))
    };
}
