import { useCallback, useState } from "react";
import { StyleSheet } from "react-native-unistyles";
// The sheet-aware list: inside a bottom sheet the list scrolls with the sheet
// gesture, and outside one it is the ordinary React Native FlatList.
import { FlatList } from "@/components/ui/scroll-view";
import type { WorkingDiffMode } from "@/git/diff-document";
import { FileHeader } from "@/git/file-header";
import type { ParsedDiffFile } from "@/git/use-diff-query";

export interface ChangedFilesListProps {
  files: ParsedDiffFile[];
  mode: WorkingDiffMode;
  onSelectFile: (path: string) => void;
}

/** The Explorer's default Changes view: one row per file, `dir/` dimmed before the name. */
export function ChangedFilesList({ files, mode, onSelectFile }: ChangedFilesListProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const handleSelectFile = useCallback(
    (path: string) => {
      setSelectedPath(path);
      onSelectFile(path);
    },
    [onSelectFile],
  );
  const renderItem = useCallback(
    ({ item, index }: { item: ParsedDiffFile; index: number }) => (
      <FileHeader
        file={item}
        flat
        workspaceFileDragScope={mode.workspaceFileDragScope}
        bodyVisible={false}
        showsBodyState={false}
        isSelected={selectedPath === item.path}
        onActivate={handleSelectFile}
        onSelect={setSelectedPath}
        onOpenFile={mode.onOpenFile}
        onOpenToSide={mode.onOpenToSide}
        onAddToChat={mode.onAddToChat}
        onCopyPath={mode.onCopyPath}
        onCopyRelativePath={mode.onCopyRelativePath}
        onReveal={mode.onReveal}
        revealTargetName={mode.revealTargetName}
        onDownload={mode.onDownload}
        onDuplicate={mode.onDuplicate}
        onRevert={mode.onRevert}
        testID={`diff-list-file-${index}`}
      />
    ),
    [handleSelectFile, mode, selectedPath],
  );

  return (
    <FlatList
      data={files}
      renderItem={renderItem}
      keyExtractor={fileKey}
      style={styles.scrollView}
      contentContainerStyle={styles.contentContainer}
      testID="changes-file-list"
    />
  );
}

function fileKey(file: ParsedDiffFile): string {
  return file.path;
}

const styles = StyleSheet.create((theme) => ({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: theme.spacing[8],
  },
}));
