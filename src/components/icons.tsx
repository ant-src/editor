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
    <circle cx="8" cy="8" r="2.1" />
    <path d="M7.23 2.86L7.41 1.23A6.8 6.8 0 0 1 8.59 1.23L8.77 2.86A5.2 5.2 0 0 1 11.09 3.82L11.09 3.82L12.38 2.79A6.8 6.8 0 0 1 13.21 3.62L12.18 4.91A5.2 5.2 0 0 1 13.14 7.23L13.14 7.23L14.77 7.41A6.8 6.8 0 0 1 14.77 8.59L13.14 8.77A5.2 5.2 0 0 1 12.18 11.09L12.18 11.09L13.21 12.38A6.8 6.8 0 0 1 12.38 13.21L11.09 12.18A5.2 5.2 0 0 1 8.77 13.14L8.77 13.14L8.59 14.77A6.8 6.8 0 0 1 7.41 14.77L7.23 13.14A5.2 5.2 0 0 1 4.91 12.18L4.91 12.18L3.62 13.21A6.8 6.8 0 0 1 2.79 12.38L3.82 11.09A5.2 5.2 0 0 1 2.86 8.77L2.86 8.77L1.23 8.59A6.8 6.8 0 0 1 1.23 7.41L2.86 7.23A5.2 5.2 0 0 1 3.82 4.91L3.82 4.91L2.79 3.62A6.8 6.8 0 0 1 3.62 2.79L4.91 3.82A5.2 5.2 0 0 1 7.23 2.86Z" />
  </>,
);
export const CheckIcon = icon(<path d="m3.5 8.5 3 3 6-7" />);
export const RunIcon = icon(<path d="M5 3.3v9.4a.6.6 0 0 0 .9.5l7.4-4.7a.6.6 0 0 0 0-1L5.9 2.8a.6.6 0 0 0-.9.5Z" />);
