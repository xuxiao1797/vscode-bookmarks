// types.d.ts
export interface ListItem {
    id: string;
    name: string;
    path: string;
  }
  
  export interface TodoItem extends ListItem {
    completed: boolean;
  }
  
  export type WebviewMessage = 
    | { command: 'saveData'; key: 'listItems' | 'todoItems'; data: ListItem[] | TodoItem[] }
    | { command: 'loadData'; key: 'listItems' | 'todoItems' }
    | { command: 'addItem'; type: 'list' | 'todo'; name: string }
    | { command: 'deleteItem'; type: 'list' | 'todo'; id: string }
    | { command: 'updateItem'; type: 'list' | 'todo'; item: ListItem | TodoItem };
  
  export type ExtensionMessage = 
    | { command: 'dataLoaded'; key: 'listItems' | 'todoItems'; data: ListItem[] | TodoItem[] }
    | { command: 'requestSave'; key: 'listItems' | 'todoItems' };