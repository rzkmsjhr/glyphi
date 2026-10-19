import React from "react";

interface GlyphiGIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const GlyphiGIcon: React.FC<GlyphiGIconProps> = ({
  size = 22,
  className = "",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="100 100 824 824"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`glyphi-g-icon ${className}`}
    style={{ display: "block", flexShrink: 0, ...style }}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="glyphiGGrad" x1="15%" y1="10%" x2="85%" y2="90%">
        <stop offset="0%" stopColor="var(--g-grad-0, #ffffff)" />
        <stop offset="25%" stopColor="var(--g-grad-25, #fff3dc)" />
        <stop offset="65%" stopColor="var(--g-grad-65, #fbbf24)" />
        <stop offset="100%" stopColor="var(--g-grad-100, #d97706)" />
      </linearGradient>
      <linearGradient id="glyphiNibGrad" x1="0%" y1="50%" x2="100%" y2="50%">
        <stop offset="0%" stopColor="var(--nib-grad-0, #f59e0b)" />
        <stop offset="100%" stopColor="var(--nib-grad-100, #fbbf24)" />
      </linearGradient>
    </defs>
    {/* Precision Bezier Letter G */}
    <path
      d="M 763 239 L 680 322 C 632 278 577 253 512 253 C 366 253 258 366 258 512 C 258 658 366 771 512 771 C 644 771 747 683 766 556 L 518 556 L 518 446 L 876 446 C 882 446 887 451 887 457 L 887 542 C 862 732 708 882 512 882 C 300 882 137 719 137 512 C 137 305 300 142 512 142 C 609 142 697 178 763 239 Z"
      fill="url(#glyphiGGrad)"
    />
    {/* Pen-Nib / Quill Inlay Accent */}
    <path
      d="M 850 466 L 872 501 L 850 536 L 584 536 L 584 466 Z"
      fill="url(#glyphiNibGrad)"
      opacity="0.45"
    />
    {/* Editorial Nib Slit Detail */}
    <line
      x1="584"
      y1="501"
      x2="840"
      y2="501"
      stroke="var(--nib-slit, #101217)"
      strokeWidth="7"
      strokeLinecap="round"
      opacity="0.85"
    />
  </svg>
);

export default GlyphiGIcon;
