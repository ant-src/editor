// The editor's icons: 16px, drawn with the text's color.
import type { ReactNode } from "react";

function icon(children: ReactNode, fill = false) {
  return function Icon() {
    return (
      <svg
        className="icon"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill={fill ? "currentColor" : "none"}
        stroke={fill ? "none" : "currentColor"}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };
}

export const PlayIcon = icon(
  <path d="M4.5 2.8v10.4a.5.5 0 0 0 .76.43l8.3-5.2a.5.5 0 0 0 0-.86l-8.3-5.2a.5.5 0 0 0-.76.43Z" />,
  true,
);
export const StopIcon = icon(<rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />, true);
export const BugIcon = icon(
  <>
    <rect x="5" y="5.5" width="6" height="8" rx="3" />
    <path d="M6.2 5.2a1.9 1.9 0 0 1 3.6 0M5 8H2.5M13.5 8H11M5 11l-2 1.5M11 11l2 1.5M5.3 6.2 3.5 4.5M10.7 6.2l1.8-1.7" />
  </>,
);
export const ContinueIcon = icon(
  <>
    <rect x="2.5" y="3" width="2" height="10" rx=".6" />
    <path d="M7 3.3v9.4a.4.4 0 0 0 .62.34l6.6-4.7a.4.4 0 0 0 0-.66l-6.6-4.7A.4.4 0 0 0 7 3.3Z" />
  </>,
  true,
);
export const StepOverIcon = icon(
  <>
    <path d="M2.5 8.5a5.5 5.5 0 0 1 10.6-2M13.5 3v3.6H9.9" />
    <circle cx="8" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </>,
);
export const StepIntoIcon = icon(
  <>
    <path d="M8 1.8v6.6M5 5.6l3 3 3-3" />
    <circle cx="8" cy="12.6" r="1.3" fill="currentColor" stroke="none" />
  </>,
);
export const StepOutIcon = icon(
  <>
    <path d="M8 8.6V2M5 4.8l3-3 3 3" />
    <circle cx="8" cy="12.6" r="1.3" fill="currentColor" stroke="none" />
  </>,
);
export const SidebarIcon = icon(
  <>
    <rect x="2" y="3" width="12" height="10" rx="1.6" />
    <path d="M6 3v10" />
  </>,
);
export const FolderIcon = icon(
  <path d="M2 4.6c0-.6.5-1.1 1.1-1.1h2.7l1.5 1.6h5.6c.6 0 1.1.5 1.1 1.1v5.2c0 .6-.5 1.1-1.1 1.1H3.1c-.6 0-1.1-.5-1.1-1.1Z" />,
);
export const FileIcon = icon(
  <path d="M4.1 2h4.6L12 5.3v7.6c0 .6-.5 1.1-1.1 1.1H4.1C3.5 14 3 13.5 3 12.9V3.1C3 2.5 3.5 2 4.1 2ZM8.5 2.2v3.3h3.3" />,
);
export const NewFileIcon = icon(
  <path d="M9 2H4.1C3.5 2 3 2.5 3 3.1v9.8c0 .6.5 1.1 1.1 1.1h3.4M9 2l3 3.3V8M9 2.2v3.3h2.8M12 10.5v4M10 12.5h4" />,
);
export const NewFolderIcon = icon(
  <path d="M7.5 12.5H3.1c-.6 0-1.1-.5-1.1-1.1V4.6c0-.6.5-1.1 1.1-1.1h2.7l1.5 1.6h5.6c.6 0 1.1.5 1.1 1.1V8M12 10.5v4M10 12.5h4" />,
);
export const ChevronIcon = icon(<path d="m6 4 4 4-4 4" />);
export const ChevronDownIcon = icon(<path d="m4.5 6.5 3.5 3.5 3.5-3.5" />);
export const ChevronUpIcon = icon(<path d="m4.5 9.5 3.5-3.5 3.5 3.5" />);
export const CloseIcon = icon(<path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />);
export const ClearIcon = icon(
  <>
    <circle cx="8" cy="8" r="5.5" />
    <path d="m4.2 4.2 7.6 7.6" />
  </>,
);
export const SaveIcon = icon(
  <path d="M8 2v7.5M5 6.8l3 3 3-3M2.5 10.5v1.9c0 .6.5 1.1 1.1 1.1h8.8c.6 0 1.1-.5 1.1-1.1v-1.9" />,
);
export const ErrorIcon = icon(
  <>
    <circle cx="8" cy="8" r="5.8" />
    <path d="m6 6 4 4M10 6l-4 4" />
  </>,
);
export const WarningIcon = icon(
  <>
    <path d="M7.1 2.9a1 1 0 0 1 1.8 0l5 9.2a1 1 0 0 1-.9 1.5H3a1 1 0 0 1-.9-1.5Z" />
    <path d="M8 6.3v3M8 11.4v.1" />
  </>,
);
export const GearIcon = icon(
  <>
    <circle cx="8" cy="8" r="2.3" />
    <path d="M5.67 3.23Q6.28 2.88 6.38 2.19L6.44 1.84Q6.54 1.15 7.24 1.15L8.76 1.15Q9.46 1.15 9.56 1.84L9.62 2.19Q9.72 2.88 10.33 3.23L10.96 3.60Q11.57 3.95 12.22 3.70L12.55 3.57Q13.20 3.32 13.55 3.92L14.31 5.23Q14.66 5.84 14.11 6.28L13.84 6.49Q13.29 6.93 13.29 7.63L13.29 8.37Q13.29 9.07 13.84 9.51L14.11 9.72Q14.66 10.16 14.31 10.77L13.55 12.08Q13.20 12.68 12.55 12.43L12.22 12.30Q11.57 12.05 10.96 12.40L10.33 12.77Q9.72 13.12 9.62 13.81L9.56 14.16Q9.46 14.85 8.76 14.85L7.24 14.85Q6.54 14.85 6.44 14.16L6.38 13.81Q6.28 13.12 5.67 12.77L5.04 12.40Q4.43 12.05 3.78 12.30L3.45 12.43Q2.80 12.68 2.45 12.08L1.69 10.77Q1.34 10.16 1.89 9.72L2.16 9.51Q2.71 9.07 2.71 8.37L2.71 7.63Q2.71 6.93 2.16 6.49L1.89 6.28Q1.34 5.84 1.69 5.23L2.45 3.92Q2.80 3.32 3.45 3.57L3.78 3.70Q4.43 3.95 5.04 3.60Z" />
  </>,
);
export const KeyboardIcon = icon(
  <>
    <rect x="1.5" y="3.5" width="13" height="9" rx="1.8" />
    <path d="M4.3 6.4h.01M6.8 6.4h.01M9.2 6.4h.01M11.7 6.4h.01M5.5 9.6h5" />
  </>,
);
export const CheckIcon = icon(<path d="m3.5 8.5 3 3 6-7" />);
export const RunIcon = icon(<path d="M5 3.3v9.4a.6.6 0 0 0 .9.5l7.4-4.7a.6.6 0 0 0 0-1L5.9 2.8a.6.6 0 0 0-.9.5Z" />);
