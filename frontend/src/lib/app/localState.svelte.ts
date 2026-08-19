export const localState = $state({
  appContainer: undefined as any,
  navigationToken: 0,
  navigationTokens: { primary: 0, secondary: 0 } as { primary: number; secondary: number },
  previewPaneToken: 0,
  currentQuickLookPath: null as any,
  currentArchivePath: null as any,
  currentProgressOperationId: null as any,
  watchedDirectoryPath: null as any,
  watchedDirectoryPaths: [] as string[],
  fileChangeRefreshTimer: null as any,
  undoStack: [] as any[],
  redoStack: [] as any[],
  isSettingColorLabel: false,
  MAX_UNDO_STACK: 50
});
