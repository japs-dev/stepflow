import React from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  id?: string;
  name?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Modern, accessible pill toggle switch.
 * Matches iOS / modern macOS design with solid-filled track and smooth gliding thumb.
 */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  title,
  ariaLabel,
  id,
  name,
  size = 'md',
  className = '',
}) => {
  const isSm = size === 'sm';

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(!checked);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.stopPropagation();
    }
  };

  return (
    <button
      type="button"
      role="switch"
      id={id}
      name={name}
      aria-checked={checked}
      aria-label={ariaLabel || title}
      title={title}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 select-none transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 ${
        isSm ? 'h-4 w-7' : 'h-5 w-9'
      } ${
        checked
          ? 'bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200'
          : 'bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400/80 dark:hover:bg-zinc-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-200 ease-in-out ${
          isSm ? 'h-3 w-3' : 'h-4 w-4'
        } ${
          checked
            ? isSm
              ? 'translate-x-3 dark:bg-zinc-900'
              : 'translate-x-4 dark:bg-zinc-900'
            : 'translate-x-0 dark:bg-zinc-200'
        }`}
      />
    </button>
  );
};
