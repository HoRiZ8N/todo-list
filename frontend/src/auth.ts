import { login, register, ApiError } from "./api.js";

const MIN_PASSWORD_LENGTH = 6;

interface PasswordRule {
  hint: HTMLElement;
  test: (password: string) => boolean;
  message: string;
}

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function initAuth(onToken: (token: string) => void): () => void {
  const loginView = byId<HTMLElement>("login-view");
  const registerView = byId<HTMLElement>("register-view");
  const loginForm = byId<HTMLFormElement>("login-form");
  const registerForm = byId<HTMLFormElement>("register-form");
  const loginEmail = byId<HTMLInputElement>("login-email");
  const loginPassword = byId<HTMLInputElement>("login-password");
  const loginError = byId<HTMLElement>("login-error");
  const registerEmail = byId<HTMLInputElement>("register-email");
  const registerPassword = byId<HTMLInputElement>("register-password");
  const registerConfirm = byId<HTMLInputElement>("register-password-confirm");
  const registerError = byId<HTMLElement>("register-error");
  const hintMatch = byId<HTMLElement>("hint-match");

  const rules: PasswordRule[] = [
    { hint: byId("hint-length"), test: (p) => p.length >= MIN_PASSWORD_LENGTH, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long` },
    { hint: byId("hint-digit"), test: (p) => /[0-9]/.test(p), message: "Password must contain a digit" },
    { hint: byId("hint-lower"), test: (p) => /[a-z]/.test(p), message: "Password must contain a lowercase letter (a-z)" },
    { hint: byId("hint-upper"), test: (p) => /[A-Z]/.test(p), message: "Password must contain an uppercase letter (A-Z)" },
  ];

  function showView() {
    const isRegister = location.hash === "#register";
    loginView.classList.toggle("hidden", isRegister);
    registerView.classList.toggle("hidden", !isRegister);
    loginError.innerHTML = "";
    registerError.innerHTML = "";
  }

  function checkPassword(): string | null {
    const password = registerPassword.value;
    const confirm = registerConfirm.value;

    for (const rule of rules) {
      const ok = rule.test(password);
      rule.hint.classList.toggle("ok", ok);
      rule.hint.classList.toggle("bad", !ok && password.length > 0);
    }

    const matchOk = password.length > 0 && password === confirm;
    hintMatch.classList.toggle("ok", matchOk);
    hintMatch.classList.toggle("bad", !matchOk && confirm.length > 0);

    const failed = rules.find((rule) => !rule.test(password));
    if (failed) return failed.message;
    if (!matchOk) return "Passwords do not match";
    return null;
  }

  async function submit(form: HTMLFormElement, errorBox: HTMLElement, request: () => Promise<{ token: string }>) {
    errorBox.innerHTML = "";
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    button.disabled = true;
    try {
      const { token } = await request();
      form.reset();
      checkPassword();
      onToken(token);
    } catch (err) {
      showError(errorBox, err);
    } finally {
      button.disabled = false;
    }
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    void submit(loginForm, loginError, () => login(loginEmail.value.trim(), loginPassword.value));
  });

  registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const problem = checkPassword();
    if (problem) {
      showError(registerError, new ApiError(problem));
      return;
    }
    void submit(registerForm, registerError, () => register(registerEmail.value.trim(), registerPassword.value));
  });

  registerPassword.addEventListener("input", () => void checkPassword());
  registerConfirm.addEventListener("input", () => void checkPassword());
  window.addEventListener("hashchange", showView);
  showView();

  return () => {
    history.replaceState(null, "", location.pathname + location.search);
    showView();
  };
}

function showError(target: HTMLElement, err: unknown) {
  const error = err instanceof ApiError ? err : new ApiError((err as Error).message);
  target.innerHTML = "";

  const title = document.createElement("p");
  title.textContent = error.message;
  target.appendChild(title);

  if (error.details.length === 0) return;

  const list = document.createElement("ul");
  list.className = "error-list";
  for (const detail of error.details) {
    const li = document.createElement("li");
    li.textContent = detail;
    list.appendChild(li);
  }
  target.appendChild(list);
}
