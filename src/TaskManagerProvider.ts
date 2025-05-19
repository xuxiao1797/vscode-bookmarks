import * as vscode from "vscode";
import { ListItem } from "./types";

export class TaskManagerProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    const styleUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "assets", "style.css")
    );
    const scriptUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "assets", "app.js")
    );

    webviewView.webview.html = getWebviewContent(styleUri, scriptUri);

    // 处理Webview消息
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "saveData":
          const path = vscode.window.activeTextEditor?.document.fileName;
          const oldData = this.context.globalState.get(message.key) || [];
          const savedData = Array.isArray(oldData) ? oldData : [];
          if (!path) {
            return;
          }
          const indexs = path.lastIndexOf("\\");
          console.log("indexs", indexs);
          const defaultName = path.substring(indexs + 1, path.length) || path;
          if (message.data.id) {
            savedData.unshift({
              id: message.data.id,
              name: message.data.name || defaultName,
              path,
              completed: message.data?.completed,
            });
          }
          await this.context.globalState.update(message.key, savedData);
          webviewView.webview.postMessage({
            command: "dataSaved",
            key: message.key,
            data: savedData,
          });
          return;
        case "saveAll":
          await this.context.globalState.update(message.key, message.data);
          return;
        case "deleteItem":
          const deleteData = this.context.globalState.get(message.key) || [];
          const updatedData = Array.isArray(deleteData) ? deleteData : [];
          console.log("message.key", message.data);
          const filteredData = updatedData.filter(
            (item: ListItem) => item.id !== message.data
          );
          await this.context.globalState.update(message.key, filteredData);
          return;
        case "loadData":
          const rawData = this.context.globalState.get(message.key) || [];
          const data = Array.isArray(rawData) ? rawData : [];
          console.log("dataLoaded", data);
          webviewView.webview.postMessage({
            command: "dataLoaded",
            key: message.key,
            data,
          });
          return;
        case "openfile":
          vscode.workspace
            .openTextDocument(message.key)
            .then(
              (doc) => {
                // 在VSCode编辑窗口展示读取到的文本
                vscode.window.showTextDocument(doc);
              },
              (err) => {
                vscode.window.showInformationMessage("Open File Failed");
                console.log(`Open ${message.key} error, ${err}.`);
              }
            )
            .then(undefined, (err) => {
              vscode.window.showInformationMessage("Open File Failed");
              console.log(`Open ${message.key} error, ${err}.`);
            });
          return;
      }
    });
  }
}

function getWebviewContent(
  styleUri: vscode.Uri,
  scriptUri: vscode.Uri
): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <title>Task Manager</title>
    </head>
    <body>
        <div class="container">
            <div class="tabs">
        <button class="tab active" data-target="#list">Bookmakrs</button>
        <button class="tab" data-target="#todo">ToDo List</button>
      </div>

      <div id="list" class="tab-content active">
        <div class="header">
          <input
            type="text"
            id="listSearchInput"
            placeholder="Search"
            oninput="ListManager.search(this.value)"
          />
          <div>
          <input style="width:20px" type="text" id="listItemInput" placeholder="input bookmark name,drag to sort" />
          <button title="Add current file to bookmarks" onclick="ListManager.addItem()">+</button>
          </div>
          
        </div>
        <ul class="items-container" id="listContainer"></ul>
      </div>

      <div id="todo" class="tab-content">
        <div class="header">
        <div>
          <input style="width:20px" type="text" id="todoItemInput" placeholder="input check lists,drag to sort" />
          <button onclick="TodoManager.addItem()">+</button>
          </div>
        </div>
        <ul class="items-container" id="todoContainer"></ul>
        <div class="collapse-item">
            <button class="collapse-header">Done</button>
            <div class="collapse-content">
                 <ul class="items-container" id="todoContainerComplete"></ul>
            </div>
        </div>
      </div>
            <script src="https://unpkg.com/sortablejs@1.15.0/Sortable.min.js"></script>
            <script src=${scriptUri}></script>
        </div>
    </body>
    </html>`;
}
