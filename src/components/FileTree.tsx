// The file tree of the open folder: directories fold, a click on a file opens it, and the
// buttons above make a file or a directory where the last click was. A right click opens a menu
// to make, rename or delete; a drag moves a file or a directory into another. The arrow keys
// move between rows, F2 renames and Delete deletes.
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { basename, dirname, type TreeNode } from "../fs/workspace";
import { key, mac } from "../keys";
import { ChevronIcon, FileIcon, FolderIcon, NewFileIcon, NewFolderIcon } from "./icons";
import { Menu, type MenuEntry } from "./Menu";

export interface FileTreeProps {
  tree: TreeNode[];
  truncated?: boolean;
  active: string | null;
  dirty: ReadonlySet<string>;
  onOpen(path: string): void;
  /** Creates a file or a directory; a rejection's message shows under the name. */
  onCreate(kind: "file" | "directory", path: string): Promise<void>;
  /** Renames or moves a file or a directory; a rejection's message shows under the name. */
  onRename(from: string, to: string): Promise<void>;
  /** Deletes a file or a directory, once the user agrees to. */
  onDelete(node: TreeNode): void;
}

interface Draft {
  kind: "file" | "directory";
  dir: string; // "" for the folder itself
  /** The path of the entry renamed, or undefined for a new one. */
  from?: string;
}

/** The type of the data a dragged row carries. */
const dragType = "application/x-ant-path";

export function FileTree(props: FileTreeProps) {
  const { tree, truncated, active, dirty, onOpen, onCreate, onRename, onDelete } = props;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [focus, setFocus] = useState(""); // the directory new entries go to
  const [cursor, setCursor] = useState<string | null>(null); // the row the keys act on
  const [draft, setDraft] = useState<Draft | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeNode | null } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragged = useRef<string | null>(null);
  const list = useRef<HTMLUListElement>(null);

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

  const toggle = (path: string, open?: boolean) => {
    setFocus(path);
    setExpanded((before) => {
      const next = new Set(before);
      if (open ?? !next.has(path)) next.add(path);
      else next.delete(path);
      return next;
    });
  };

  const create = (kind: Draft["kind"], dir = focus) => {
    expand(dir);
    setDraft({ kind, dir });
  };
  const rename = (node: TreeNode) => setDraft({ kind: node.kind, dir: dirname(node.path), from: node.path });

  const submit = async (draft: Draft, entered: string) => {
    const path = (draft.dir ? draft.dir + "/" : "") + entered;
    if (draft.from !== undefined) {
      if (path !== draft.from) await onRename(draft.from, path);
      setDraft(null);
      setCursor(path);
      if (draft.kind === "directory" && expanded.has(draft.from)) expand(path);
      return;
    }
    await onCreate(draft.kind, path);
    setDraft(null);
    if (draft.kind === "directory") {
      expand(path);
      setFocus(path);
    } else {
      expand(dirname(path));
    }
  };

  const entries = (node: TreeNode | null): MenuEntry[] => {
    const dir = node === null ? "" : node.kind === "directory" ? node.path : dirname(node.path);
    const where = dir ? " in " + dir : "";
    const made: MenuEntry[] = [
      { label: "New file" + where, onSelect: () => create("file", dir) },
      { label: "New folder" + where, onSelect: () => create("directory", dir) },
    ];
    if (!node) return made;
    return [
      ...made,
      "separator",
      { label: "Rename…", shortcut: "F2", onSelect: () => rename(node) },
      { label: "Delete", shortcut: mac ? key("mod+Backspace") : "Del", danger: true, onSelect: () => onDelete(node) },
    ];
  };

  const openMenu = (e: MouseEvent, node: TreeNode | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (node) setCursor(node.path);
    setMenu({ x: e.clientX, y: e.clientY, node });
  };

  // ---- dragging

  /** canDrop says whether the entry at from can move into the directory dir. */
  const canDrop = (from: string | null, dir: string) =>
    from !== null && dir !== dirname(from) && dir !== from && !dir.startsWith(from + "/");

  const dragOver = (e: DragEvent, dir: string) => {
    if (!canDrop(dragged.current, dir)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(dir);
  };

  const drop = (e: DragEvent, dir: string) => {
    const from = dragged.current;
    e.preventDefault();
    e.stopPropagation();
    endDrag();
    if (!from || !canDrop(from, dir)) return;
    const to = (dir ? dir + "/" : "") + basename(from);
    onRename(from, to).then(
      () => {
        if (dir) expand(dir);
        setCursor(to);
      },
      () => {}, // the editor says why in its console
    );
  };

  const endDrag = () => {
    dragged.current = null;
    setDropTarget(null);
  };

  const dragProps = (node: TreeNode) => {
    const dir = node.kind === "directory" ? node.path : dirname(node.path);
    return {
      draggable: draft?.from !== node.path,
      onDragStart: (e: DragEvent) => {
        dragged.current = node.path;
        e.dataTransfer.setData(dragType, node.path);
        e.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: endDrag,
      onDragOver: (e: DragEvent) => dragOver(e, dir),
      onDrop: (e: DragEvent) => drop(e, dir),
    };
  };

  // ---- keys

  const rowsInView = () => [...(list.current?.querySelectorAll<HTMLButtonElement>(".tree-row") ?? [])];

  const onKeyDown = (e: KeyboardEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLButtonElement>(".tree-row");
    if (!row) return;
    const path = row.dataset.path!;
    const node = find(tree, path);
    const isDir = node?.kind === "directory";
    const rows = rowsInView();
    const i = rows.indexOf(row);
    const go = (target: HTMLButtonElement | undefined) => target?.focus();
    switch (e.key) {
      case "ArrowDown":
        go(rows[i + 1]);
        break;
      case "ArrowUp":
        go(rows[i - 1]);
        break;
      case "Home":
        go(rows[0]);
        break;
      case "End":
        go(rows.at(-1));
        break;
      case "ArrowRight":
        if (isDir && !expanded.has(path)) toggle(path, true);
        else if (isDir) go(rows[i + 1]);
        break;
      case "ArrowLeft":
        if (isDir && expanded.has(path)) toggle(path, false);
        else go(rows.find((r) => r.dataset.path === dirname(path)));
        break;
      case "F2":
        if (node) rename(node);
        break;
      case "Delete":
      case "Backspace":
        if (e.key === "Backspace" && !e.metaKey) return;
        if (node) onDelete(node);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  // The row the keys act on is the one tab goes to: the last one focused, or the active file.
  const tabStop = cursor !== null && find(tree, cursor) ? cursor : (active ?? tree[0]?.path);

  const rowProps = (node: TreeNode) => ({
    "data-path": node.path,
    tabIndex: node.path === tabStop ? 0 : -1,
    title: node.path,
    onFocus: () => setCursor(node.path),
    onContextMenu: (e: MouseEvent) => openMenu(e, node),
    ...dragProps(node),
  });

  const rows = (nodes: TreeNode[], depth: number, dir: string) => (
    <>
      {draft?.dir === dir && draft.from === undefined && (
        <DraftRow key="(draft)" draft={draft} depth={depth} onSubmit={submit} onCancel={() => setDraft(null)} />
      )}
      {nodes.map((node) =>
        draft?.from === node.path ? (
          <DraftRow key={node.path} draft={draft} depth={depth} onSubmit={submit} onCancel={() => setDraft(null)} />
        ) : node.kind === "directory" ? (
          <li key={node.path} role="treeitem" aria-expanded={expanded.has(node.path)}>
            <button
              className={"tree-row" + (dropTarget === node.path ? " drop-target" : "")}
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => toggle(node.path)}
              {...rowProps(node)}
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
              {...rowProps(node)}
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
        <span className="panel-title">Files</span>
        <button
          className="icon-button"
          title={`New file${focus ? " in " + focus : ""}`}
          aria-label="New file"
          onClick={() => create("file")}
        >
          <NewFileIcon />
        </button>
        <button
          className="icon-button"
          title={`New folder${focus ? " in " + focus : ""}`}
          aria-label="New folder"
          onClick={() => create("directory")}
        >
          <NewFolderIcon />
        </button>
      </header>
      <ul
        ref={list}
        className={"tree" + (dropTarget === "" ? " drop-target" : "")}
        role="tree"
        aria-label="Files"
        onKeyDown={onKeyDown}
        onContextMenu={(e) => openMenu(e, null)}
        onDragOver={(e) => dragOver(e, "")}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
        }}
        onDrop={(e) => drop(e, "")}
      >
        {rows(tree, 0, "")}
        {tree.length === 0 && !draft && <li className="tree-empty">The folder is empty.</li>}
        {truncated && <li className="tree-empty">The folder has more files than are shown.</li>}
      </ul>
      {menu && (
        <Menu
          label={menu.node ? menu.node.name : "Files"}
          x={menu.x}
          y={menu.y}
          entries={entries(menu.node)}
          onClose={() => setMenu(null)}
        />
      )}
    </nav>
  );
}

function find(nodes: TreeNode[], path: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.kind === "directory" && path.startsWith(node.path + "/")) return find(node.children ?? [], path);
  }
  return undefined;
}

function DraftRow(props: {
  draft: Draft;
  depth: number;
  onSubmit(draft: Draft, name: string): Promise<void>;
  onCancel(): void;
}) {
  const { draft, depth, onSubmit, onCancel } = props;
  const [name, setName] = useState(draft.from !== undefined ? basename(draft.from) : "");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false); // submitted, or cancelled with Escape: a blur that follows does nothing

  // A renamed file's name is selected up to its extension, so that typing replaces the name.
  useEffect(() => {
    const el = input.current!;
    el.focus();
    const dot = draft.kind === "file" ? el.value.lastIndexOf(".") : -1;
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
  }, [draft]);

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
    e.stopPropagation(); // the tree's keys are not for the name
    if (e.key === "Enter") void submit();
    if (e.key === "Escape") {
      done.current = true;
      onCancel();
    }
  };

  const label = draft.from !== undefined ? "New name" : draft.kind === "file" ? "File name" : "Folder name";
  return (
    <li className="tree-draft" style={{ paddingLeft: 8 + depth * 14 + (draft.kind === "file" ? 18 : 0) }}>
      <div className="tree-draft-row">
        {draft.kind === "file" ? <FileIcon /> : <FolderIcon />}
        <input
          ref={input}
          value={name}
          spellCheck={false}
          aria-label={label}
          placeholder={draft.kind === "file" ? "name.ant" : "folder"}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={onKeyDown}
          onBlur={() => (done.current || error ? undefined : name.trim() ? void submit() : onCancel())}
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
