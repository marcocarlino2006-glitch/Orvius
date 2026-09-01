"use client";

type OsMobileNavProps = {
  open: boolean;
  onToggle: () => void;
};

export function OsMobileNavButton({ open, onToggle }: OsMobileNavProps) {
  return (
    <button
      type="button"
      className="os-mobile-nav-btn"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? "Close menu" : "Open menu"}
    >
      <span className={`os-mobile-nav-icon ${open ? "os-mobile-nav-icon-open" : ""}`}>
        <span />
        <span />
        <span />
      </span>
    </button>
  );
}

export function OsMobileNavBackdrop({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <button
      type="button"
      className="os-mobile-nav-backdrop"
      onClick={onClose}
      aria-label="Close menu"
    />
  );
}
