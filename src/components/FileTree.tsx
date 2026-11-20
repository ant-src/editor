// The file tree of the open folder: directories fold, a click on a file opens it, and the
// buttons above make a file or a directory where the last click was.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { dirname, type TreeNode } from "../fs/workspace";
import { ChevronIcon, FileIcon, FolderIcon, NewFileIcon, NewFolderIcon, RefreshIcon } from "./icons";

export interface FileTreeProps {
  name: string;
  tree: TreeNode[];
  truncated?: boolean;
  active: string | null;
  dirty: ReadonlySet<string>;
  onOpen(path: string): void;
  /** Creates a file or a directory; a rejection's message shows under the name. */
  onCreate(kind: "file" | "directory", path: string): Promise<void>;
  onRefresh(): void;
}

interface Draft {
  kind: "file" | "directory";
  dir: string; // "" for the folder itself
}

export function FileTree({ name, tree, truncated, active, dirty, onOpen, onCreate, onRefresh }: FileTreeProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [focus, setFocus] = useState(""); // the directory new entries go to
  const [draft, setDraft] = useState<Draft | null>(null);

  const expand = (dir: string) =>
    setExpanded((before) => {
      const next = new Set(before);
      for (let d = dir; d !== ""; d = dirname(d)) next.add(d);
      return next;
    });

  // The active file's directories unfold, so that it shows.
  useEffect(() => {
    if (active) expand(dirname(active));
  }, [active]);

  const toggle = (path: string) => {
    setFocus(path);
    setExpanded((before) => {
      const next = new Set(before);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  };

  const start = (kind: Draft["kind"]) => {
    expand(focus);
    setDraft({ kind, dir: focus });
  };

  const submit = async (draft: Draft, entered: string) => {
    const path = (draft.dir ? draft.dir + "/" : "") + entered;
    await onCreate(draft.kind, path);
    setDraft(null);
    if (draft.kind === "directory") {
      expand(path);
      setFocus(path);
    } else {
      expand(dirname(path));
    }
  };

  const rows = (nodes: TreeNode[], depth: number, dir: string) => (
    <>
      {draft?.dir === dir && (
        <DraftRow key="(draft)" draft={draft} depth={depth} onSubmit={submit} onCancel={() => setDraft(null)} />
      )}
      {nodes.map((node) =>
        node.kind === "directory" ? (
          <li key={node.path} role="treeitem" aria-expanded={expanded.has(node.path)}>
            <button
              className={"tree-row" + (focus === node.path ? " focused" : "")}
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => toggle(node.path)}
              title={node.path}
            >
              <span className={"tree-chevron" + (expanded.has(node.path) ? " open" : "")}>
                <ChevronIcon />
              </span>
              <FolderIcon />
              <span className="tree-name">{node.name}</span>
            </button>
            {expanded.has(node.path) && <ul role="group">{rows(node.children ?? [], depth + 1, node.path)}</ul>}
          </li>
        ) : (
          <li key={node.path} role="treeitem" aria-selected={active === node.path}>
            <button
              className={"tree-row" + (active === node.path ? " active" : "")}
              style={{ paddingLeft: 8 + depth * 14 + 18 }}
              onClick={() => {
                setFocus(dirname(node.path));
                onOpen(node.path);
              }}
              title={node.path}
            >
              <FileIcon />
              <span className={"tree-name" + (node.name.endsWith(".ant") ? " ant" : "")}>{node.name}</span>
              {dirty.has(node.path) && <span className="dirty-dot" aria-label="unsaved changes" />}
            </button>
          </li>
        ),
      )}
    </>
  );

  return (
    <nav className="file-tree" aria-label="Files">
      <header className="panel-header">
        <span className="panel-title" title={name}>
          {name}
        </span>
        <button
          className="icon-button"
          title={`New file${focus ? " in " + focus : ""}`}
          aria-label="New file"
          onClick={() => start("file")}
        >
          <NewFileIcon />
        </button>
        <button
          className="icon-button"
          title={`New folder${focus ? " in " + focus : ""}`}
          aria-label="New folder"
          onClick={() => start("directory")}
        >
          <NewFolderIcon />
        </button>
        <button className="icon-button" title="Reload the folder from disk" aria-label="Refresh" onClick={onRefresh}>
          <RefreshIcon />
        </button>
      </header>
      <ul className="tree" role="tree">
        {rows(tree, 0, "")}
        {tree.length === 0 && !draft && <li className="tree-empty">The folder is empty.</li>}
        {truncated && <li className="tree-empty">The folder has more files than are shown.</li>}
      </ul>
    </nav>
  );
}

function DraftRow(props: {
  draft: Draft;
  depth: number;
  onSubmit(draft: Draft, name: string): Promise<void>;
  onCancel(): void;
}) {
  const { draft, depth, onSubmit, onCancel } = props;
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => input.current?.focus(), []);

  const submit = async () => {
    if (done.current) return;
    if (name.trim() === "") return onCancel();
    done.current = true;
    try {
      await onSubmit(draft, name.trim());
    } catch (err) {
      done.current = false;
      setError((err as Error).message);
      input.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") void submit();
    if (e.key === "Escape") onCancel();
  };

  return (
    <li className="tree-draft" style={{ paddingLeft: 8 + depth * 14 + (draft.kind === "file" ? 18 : 0) }}>
      <div className="tree-draft-row">
        {draft.kind === "file" ? <FileIcon /> : <FolderIcon />}
        <input
          ref={input}
          value={name}
          spellCheck={false}
          aria-label={draft.kind === "file" ? "File name" : "Folder name"}
          placeholder={draft.kind === "file" ? "name.ant" : "folder"}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={onKeyDown}
          onBlur={() => (error ? undefined : name.trim() ? void submit() : onCancel())}
        />
      </div>
      {error && (
        <div className="tree-draft-error" role="alert">
          {error}
        </div>
      )}
    </li>
  );
}
