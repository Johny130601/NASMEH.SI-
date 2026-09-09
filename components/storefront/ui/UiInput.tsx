import type { InputHTMLAttributes, ReactNode } from "react";

export interface UiInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/**
 * Floating-label input (research 06 §9): pure CSS via peer/placeholder-shown,
 * SSR-safe, brand focus ring. Label doubles as accessible name.
 */
export function UiInput({
  label,
  error,
  hint,
  id,
  name,
  className = "",
  ...rest
}: UiInputProps) {
  const inputId = id ?? name;
  const messageId = inputId ? `${inputId}-message` : undefined;

  return (
    <div className={["flex flex-col gap-1.5", className].filter(Boolean).join(" ")}>
      <div className="relative">
        <input
          id={inputId}
          name={name}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={[
            "peer h-[3.25rem] w-full rounded-input border bg-white px-4 pt-5 text-base text-dark-1 outline-none transition-colors placeholder-transparent",
            error
              ? "border-error focus:border-error"
              : "border-light-1 focus:border-brand",
          ].join(" ")}
          {...rest}
        />
        <label
          htmlFor={inputId}
          className={[
            "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base transition-all duration-150",
            "peer-focus:top-[0.95rem] peer-focus:text-xs",
            "peer-[:not(:placeholder-shown)]:top-[0.95rem] peer-[:not(:placeholder-shown)]:text-xs",
            error ? "text-error" : "text-mid-2 peer-focus:text-brand",
          ].join(" ")}
        >
          {label}
        </label>
      </div>
      {error ? (
        <p id={messageId} role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-sm text-mid-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface UiFormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

/** Generic form-field wrapper for non-UiInput controls (selects, groups…). */
export function UiFormField({
  label,
  htmlFor,
  error,
  hint,
  children,
}: UiFormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-dark-1">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-mid-2">{hint}</p>
      ) : null}
    </div>
  );
}
