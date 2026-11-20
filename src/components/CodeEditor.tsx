// The Monaco editor, showing one buffer at a time: breakpoints in the gutter, set by a click
// there, and the line the program is paused at.
import { useEffect, useRef } from "react";
import { monaco } from "../editor/monaco";

export interface CodeEditorProps {
  model: monaco.editor.ITextModel | null;
  breakpoints: readonly number[];
  /** Of the breakpoints, those the debugger could not bind. */
  unverified: readonly number[];
  /** The line of this buffer the program is paused at: in the innermost frame, or in a caller. */
  paused?: { line: number; innermost: boolean };
  /** A position to bring into view, and the cursor to: a new object each time. */
  reveal?: { line: number; column: number } | null;
  onToggleBreakpoint(line: number): void;
  /** Called when an edit moved the breakpoints to other lines. */
  onBreakpointsMoved(lines: number[]): void;
}

const { GlyphMarginLane, MouseTargetType, TrackedRangeStickiness } = monaco.editor;

export function CodeEditor(props: CodeEditorProps) {
  const { model, breakpoints, unverified, paused, reveal } = props;
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const viewStates = useRef(new WeakMap<monaco.editor.ITextModel, monaco.editor.ICodeEditorViewState>());
  const marks = useRef<monaco.editor.IEditorDecorationsCollection | null>(null); // breakpoints
  const position = useRef<monaco.editor.IEditorDecorationsCollection | null>(null); // the paused line
  const hint = useRef<monaco.editor.IEditorDecorationsCollection | null>(null); // where a click would set one
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const ed = monaco.editor.create(container.current!, {
      model: null,
      automaticLayout: true,
      glyphMargin: true,
      minimap: { enabled: false },
      fontFamily: '"Commit Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 20,
      lineNumbersMinChars: 3,
      padding: { top: 8 },
      scrollBeyondLastLine: false,
      renderLineHighlight: "line",
      smoothScrolling: true,
      tabSize: 2,
      fixedOverflowWidgets: true,
      "semanticHighlighting.enabled": true,
      stickyScroll: { enabled: false },
    });
    editor.current = ed;

    const onGutter = (e: monaco.editor.IEditorMouseEvent) =>
      e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN ? e.target.position?.lineNumber : undefined;
    ed.onMouseDown((e) => {
      const line = onGutter(e);
      if (line !== undefined) latest.current.onToggleBreakpoint(line);
    });
    ed.onMouseMove((e) => {
      const line = onGutter(e);
      hint.current?.set(
        line === undefined || latest.current.breakpoints.includes(line)
          ? []
          : [
              {
                range: new monaco.Range(line, 1, line, 1),
                options: { glyphMarginClassName: "bp-hint", glyphMargin: { position: GlyphMarginLane.Left } },
              },
            ],
      );
    });
    ed.onMouseLeave(() => hint.current?.clear());
    // An edit above a breakpoint moves it with its line.
    ed.onDidChangeModelContent(() => {
      const lines = (marks.current?.getRanges() ?? []).map((r) => r.startLineNumber);
      const now = [...new Set(lines)].sort((a, b) => a - b);
      const before = latest.current.breakpoints;
      if (now.length !== before.length || now.some((l, i) => l !== before[i])) latest.current.onBreakpointsMoved(now);
    });
    return () => ed.dispose();
  }, []);

  // The buffer shown, with the scroll position and the selection it had when it last showed.
  useEffect(() => {
    const ed = editor.current!;
    const before = ed.getModel();
    if (before === model) return;
    if (before) viewStates.current.set(before, ed.saveViewState()!);
    ed.setModel(model);
    marks.current = ed.createDecorationsCollection();
    position.current = ed.createDecorationsCollection();
    hint.current = ed.createDecorationsCollection();
    const state = model && viewStates.current.get(model);
    if (state) ed.restoreViewState(state);
    if (model) ed.focus();
  }, [model]);

  useEffect(() => {
    if (!model) return;
    const last = model.getLineCount();
    marks.current?.set(
      breakpoints
        .filter((line) => line <= last)
        .map((line) => ({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            glyphMarginClassName: unverified.includes(line) ? "bp-glyph unverified" : "bp-glyph",
            glyphMarginHoverMessage: unverified.includes(line) ? { value: "No statement to stop at here" } : undefined,
            glyphMargin: { position: GlyphMarginLane.Left },
            stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        })),
    );
  }, [model, breakpoints, unverified]);

  useEffect(() => {
    if (!model) return;
    position.current?.set(
      paused && paused.line <= model.getLineCount()
        ? [
            {
              range: new monaco.Range(paused.line, 1, paused.line, 1),
              options: {
                isWholeLine: true,
                className: paused.innermost ? "paused-line" : "paused-line caller",
                glyphMarginClassName: paused.innermost ? "paused-glyph" : "paused-glyph caller",
                glyphMargin: { position: GlyphMarginLane.Left },
                zIndex: 10,
              },
            },
          ]
        : [],
    );
  }, [model, paused?.line, paused?.innermost]);

  useEffect(() => {
    const ed = editor.current!;
    if (!model || !reveal || ed.getModel() !== model) return;
    const line = Math.min(Math.max(reveal.line, 1), model.getLineCount());
    ed.setPosition({ lineNumber: line, column: reveal.column });
    ed.revealLineInCenterIfOutsideViewport(line);
  }, [model, reveal]);

  return <div className="code-editor" ref={container} />;
}
