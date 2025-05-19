const vscode = acquireVsCodeApi();
// 通用工具模块
const Utils = {
  saveToLocal: async (key, data) => {
    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.data.command === "dataSaved" && event.data.key === key) {
          resolve(event.data.data);
          window.removeEventListener("message", handler);
        }
      };
      window.addEventListener("message", handler);
      vscode.postMessage({
        command: "saveData",
        key,
        data,
      });
    }).then((data) => data || []);
  },
  saveAll: async (key, data) => {
    vscode.postMessage({
      command: "saveAll",
      key,
      data,
    });
  },
  deleteItems: (key, data) =>
    vscode.postMessage({
      command: "deleteItem",
      key,
      data,
    }),
  getFromLocal: async (key) => {
    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.data.command === "dataLoaded" && event.data.key === key) {
          window.removeEventListener("message", handler);
          resolve(event.data.data);
        }
      };
      window.addEventListener("message", handler);
      vscode.postMessage({ command: "loadData", key });
    }).then((data) => data || []);
  },

  generateId: () =>
    Date.now().toString(36) + Math.random().toString(36).substr(2),

  debounce: (func, delay) => {
    let timeout;
    return function (...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), delay);
    };
  },
};

// 书签模块
const ListManager = {
  key: "listItems",
  filteredItems: [],
  init: async function () {
    const rawData = await Utils.getFromLocal(this.key);
    this.items = Array.isArray(rawData) ? rawData : [];
    this.filteredItems = [...this.items];
    this.render();
    this.bindEvents();
    this.initDrag();
  },

  render: function () {
    const container = document.getElementById("listContainer");
    container.innerHTML = this.filteredItems
      ?.map(
        (item) => `
            <li class="item" data-id="${item.id}" data-url="${item.path}" draggable="true">
                <span class="item-content" title=${item.path} >${item.name}</span>
                <span class="item-actions">
                    <button class="delete-btn" data-id="${item.id}">X</button>
                </span>
            </li>
        `
      )
      .join("");
  },
  search: Utils.debounce(function (keyword) {
    this.filteredItems = this.items.filter((item) =>
      item.name.toLowerCase().includes(keyword.toLowerCase())
    );
    this.render();
  }, 300),

  bindEvents: function () {
    // TODO: 编辑名称
    // document
    //   .getElementById("listContainer")
    //   .addEventListener("dblclick", (e) => {
    //     if (e.target.classList.contains("item-content")) {
    //       this.showEditInput(e.target);
    //     }
    //   });

    document.getElementById("listContainer").addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-btn")) {
        e.preventDefault();
        e.stopPropagation();
        this.deleteItem(e.target.dataset.id);
      }
    });

    const listContainer = document.getElementById("listContainer");
    listContainer.addEventListener("click", (e) => {
      const contentEl = e.target.closest(".item");
      if (!contentEl) return;
      const url = contentEl.dataset.url;
      // 打开文件
      if (url) {
        vscode.postMessage({
          command: "openfile",
          key: url,
        });
      }
    });
  },

  showEditInput: function (element) {
    const input = document.createElement("input");
    input.className = "edit-input";
    input.value = element.textContent;

    input.addEventListener("blur", () => {
      element.textContent = input.value;
      const listItem = this.items.find(
        (item) =>
          item.id ===
          element.parentElement.querySelector(".delete-btn").dataset.id
      );
      if (listItem) {
        listItem.name = input.value;
        Utils.saveToLocal(this.key, this.items);
      }
      input.replaceWith(element);
    });

    element.replaceWith(input);
    input.focus();
  },

  addItem: async function () {
    const input = document.getElementById("listItemInput");
    const name = input.value.trim();

    const newData = { id: Utils.generateId(), name };
    const savedData = await Utils.saveToLocal(this.key, newData);
    this.items = savedData;
    this.filteredItems = this.items;
    this.render();
    input.value = "";
  },

  deleteItem: function (id) {
    this.items = this.items.filter((item) => item.id !== id);
    Utils.deleteItems(this.key, id);
    
    this.filteredItems = this.filteredItems.filter((item) => item.id !== id);
    this.render();
  },
  initDrag: function () {
    const container = document.getElementById("listContainer");
    let draggableItem = null;

    container.addEventListener("dragstart", (e) => {
      if (e.target.classList.contains("item")) {
        draggableItem = e.target;
        setTimeout(() => e.target.classList.add("dragging"), 0);
      }
    });

    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      const afterElement = this.getDragAfterElement(container, e.clientY);
      const currentItem = document.querySelector(".dragging");

      if (afterElement == null) {
        container.appendChild(currentItem);
      } else {
        container.insertBefore(currentItem, afterElement);
      }

      this.updateDropZones();
    });

    container.addEventListener("dragend", (e) => {
      const items = Array.from(container.children);
      const newOrder = items.map((item) => item.dataset.id);
      this.items = newOrder
        .map((id) => this.items.find((item) => item.id === id))
        .filter((item) => item); // 过滤undefined
      this.filteredItems = [...this.items];
      Utils.saveAll(this.key, this.items);
      e.target.classList.remove("dragging");
      this.updateDropZones(true);
    });
  },

  getDragAfterElement: function (container, y) {
    const items = [...container.querySelectorAll(".item:not(.dragging)")];

    return items.reduce(
      (closest, item) => {
        const box = item.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: item };
        } else {
          return closest;
        }
      },
      { offset: Number.NEGATIVE_INFINITY }
    ).element;
  },

  updateDropZones: function (clear = false) {
    const items = document.querySelectorAll("#listContainer .item");
    items.forEach((item) => {
      item.classList.toggle("dropzone", !clear);
      item.style.borderTop = clear ? "" : "2px solid transparent";
    });
  },
};

// 待办事项管理模块
const TodoManager = {
  key: "todoItems",
  filteredItems: [],
  init: async function () {
    const rawData = await Utils.getFromLocal(this.key);
    this.items = Array.isArray(rawData) ? rawData : [];
    this.filteredItems = [...this.items];
    this.render();
    this.bindEvents();
    this.initDrag();
  },

  render: function () {
    const incompleteList = this.filteredItems.filter((item) => !item.completed);
    const completedList = this.filteredItems.filter((item) => item.completed);
    const container = document.getElementById("todoContainer");
    container.innerHTML = incompleteList
      .map(
        (item) => `
            <li class="item ${item.completed ? "completed" : ""}" data-id="${
          item.id
        }"  data-url="${item.path}" draggable="true">
                <input type="checkbox" class="checkbox" ${
                  item.completed ? "checked" : ""
                } data-id="${item.id}">
                <span class="item-content" style="max-width: calc(100% - 60px);white-space:nowrap" title="${
                  item.name
                }" onclick="window.location.href='#'">${item.name}</span>
                <div class="item-actions">
                    <button class="delete-btn" data-id="${item.id}">X</button>
                </div>
            </li>
        `
      )
      .join("");
    const completeContainer = document.getElementById("todoContainerComplete");
    completeContainer.innerHTML = completedList
      .map(
        (item) => `
            <li class="item ${item.completed ? "completed" : ""}" data-id="${
          item.id
        }"  data-url="${item.path}" draggable="true">
                <input type="checkbox" class="checkbox" ${
                  item.completed ? "checked" : ""
                } data-id="${item.id}">
                <span class="item-content" style="max-width: calc(100% - 60px);white-space:nowrap" title="${
                  item.name
                }" onclick="window.location.href='#'">${item.name}</span>
                <div class="item-actions">
                    <button class="delete-btn" data-id="${item.id}">X</button>
                </div>
            </li>
        `
      )
      .join("");
  },
  search: Utils.debounce(
    function (keyword) {
      this.filteredItems = this.items.filter((item) =>
        item.name.toLowerCase().includes(keyword.toLowerCase())
      );
      this.render();
    }.bind(ListManager),
    300
  ),
  initDrag: function () {
    const container = document.getElementById("todoContainer");
    let draggableItem = null;

    container.addEventListener("dragstart", (e) => {
      if (e.target.classList.contains("item")) {
        draggableItem = e.target;
        setTimeout(() => e.target.classList.add("dragging"), 0);
      }
    });

    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      const afterElement = this.getDragAfterElement(container, e.clientY);
      const currentItem = document.querySelector(".dragging");

      if (afterElement == null) {
        container.appendChild(currentItem);
      } else {
        container.insertBefore(currentItem, afterElement);
      }

      this.updateDropZones();
    });

    container.addEventListener("dragend", (e) => {
      const items = Array.from(container.children);
      const newOrder = items.map((item) => item.dataset.id);
      this.items = newOrder
        .map((id) => this.items.find((item) => item.id === id))
        .filter((item) => item); // 过滤undefined
      this.filteredItems = [...this.items];
      Utils.saveAll(this.key, this.items);
      e.target.classList.remove("dragging");
      this.updateDropZones(true);
    });
  },
  getDragAfterElement: function (container, y) {
    const items = [...container.querySelectorAll(".item:not(.dragging)")];

    return items.reduce(
      (closest, item) => {
        const box = item.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: item };
        } else {
          return closest;
        }
      },
      { offset: Number.NEGATIVE_INFINITY }
    ).element;
  },

  updateDropZones: function (clear = false) {
    const items = document.querySelectorAll("#todoContainer .item");
    items.forEach((item) => {
      item.classList.toggle("dropzone", !clear);
      item.style.borderTop = clear ? "" : "2px solid transparent";
    });
  },

  bindEvents: function () {
    document
      .getElementById("todoContainer")
      .addEventListener("dblclick", (e) => {
        if (e.target.classList.contains("item-content")) {
          this.showEditInput(e.target);
        }
      });

    document.getElementById("todoContainer").addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-btn")) {
        this.deleteItem(e.target.dataset.id);
      }
      if (e.target.classList.contains("checkbox")) {
        this.toggleComplete(e.target.dataset.id);
        return false;
      }
    });

    document.getElementById("todoContainerComplete").addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-btn")) {
        this.deleteItem(e.target.dataset.id);
      }
      if (e.target.classList.contains("checkbox")) {
        this.toggleComplete(e.target.dataset.id);
        return false;
      }
    });

    // 点击待办跳转文件
    // const todoContainer = document.getElementById("todoContainer");
    // todoContainer.addEventListener("click", (e) => {
    //   const contentEl = e.target.closest(".item");
    //   if (!contentEl) return;
    //   const url = contentEl.dataset.url;
    //   // 打开文件
    //   if (url) {
    //     vscode.postMessage({
    //       command: "openfile",
    //       key: url,
    //     });
    //   }
    // });
  },

  showEditInput: function (element) {
    const input = document.createElement("input");
    input.className = "edit-input";
    input.value = element.textContent;

    input.addEventListener("blur", () => {
      element.textContent = input.value;
      const todoItem = this.items.find(
        (item) =>
          item.id ===
          element.parentElement.querySelector(".delete-btn").dataset.id
      );
      if (todoItem) {
        todoItem.name = input.value;
        Utils.saveToLocal(this.key, this.items);
      }
      input.replaceWith(element);
    });

    element.replaceWith(input);
    input.focus();
  },

  addItem: async function () {
    const input = document.getElementById("todoItemInput");
    const name = input.value.trim();
    const newData = { id: Utils.generateId(), name };
    const savedData = await Utils.saveToLocal(this.key, newData);
    this.items = savedData;
    this.filteredItems = this.items;
    this.render();
    input.value = "";
  },

  deleteItem: function (id) {
    this.items = this.items.filter((item) => item.id !== id);
    Utils.deleteItems(this.key, id);

    this.filteredItems = this.filteredItems.filter((item) => item.id !== id);
    this.render();
  },

  toggleComplete: function (id) {
    const item = this.items.find((item) => item.id === id);
    if (item) {
      item.completed = !item.completed;
      Utils.saveAll(this.key, this.items);
      this.render();
    }
  },
};

// 初始化页面
document.addEventListener("DOMContentLoaded", () => {
  // 绑定tab切换事件
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".tab, .tab-content")
        .forEach((el) => el.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(tab.dataset.target).classList.add("active");
    });
  });

  // 初始化模块
  ListManager.init();
  TodoManager.init();
});

document.querySelectorAll(".collapse-header").forEach((header) => {
  header.addEventListener("click", () => {
    // 切换当前面板状态
    header.classList.toggle("active");
    const content = header.nextElementSibling;

    if (content.style.maxHeight) {
      content.style.maxHeight = null;
    } else {
      content.style.maxHeight = content.scrollHeight + "px";
    }
  });
});
