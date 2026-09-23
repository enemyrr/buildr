import { copyFile } from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, nativeImage } from "electron";
import log from "electron-log/main";
import { resolveManagedAttachmentPath } from "./attachments.js";

const DRAG_ICON_WIDTH = 128;

async function resolveDragIcon(filePath: string): Promise<Electron.NativeImage> {
  const image = nativeImage.createFromPath(filePath);
  if (!image.isEmpty()) {
    return image.getSize().width > DRAG_ICON_WIDTH
      ? image.resize({ width: DRAG_ICON_WIDTH })
      : image;
  }
  // macOS rejects startDrag without an icon, and nativeImage can't decode every format.
  return await app.getFileIcon(filePath);
}

export function registerAttachmentExportHandlers(): void {
  ipcMain.on("paseo:attachments:start-drag", (event, inputPath: unknown) => {
    void (async () => {
      const filePath = resolveManagedAttachmentPath(inputPath);
      event.sender.startDrag({ file: filePath, icon: await resolveDragIcon(filePath) });
    })().catch((error) => log.error("[attachments] start drag failed", error));
  });

  ipcMain.handle(
    "paseo:attachments:save-as",
    async (event, input: { path?: unknown; fileName?: unknown }) => {
      const filePath = resolveManagedAttachmentPath(input.path);
      const fileName =
        typeof input.fileName === "string" && input.fileName.trim()
          ? path.basename(input.fileName.trim())
          : path.basename(filePath);
      const win = BrowserWindow.fromWebContents(event.sender);
      const options = { defaultPath: path.join(app.getPath("downloads"), fileName) };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return false;
      await copyFile(filePath, result.filePath);
      return true;
    },
  );
}
